import {
  mergeOptionsWithDefaults,
  normalizeDownloadOptions,
  type BatchImageDownloadOptions,
  type DownloadableImage,
  type DownloadImageOptions,
  type NameOrDownloadImageOptions,
} from '$lib/images';
import {
  batchDelayForEach,
  isDefined,
  isEmptyString,
  isFunction,
  isNonEmptyString,
  isNullish,
  isString,
  pathJoin,
  sanitizeFilename,
  sanitizeFilepath,
  triggerDownload,
  type Nullable,
} from '$utils';
import JSZip from 'jszip';
import type { BatchDelayOptions } from './../../utils/array';

export type NodeTraversalFn = (node?: Node, archive?: ArchiveTool) => Promise<any> | any;

export class ArchiveTool {
  #name: string = 'archive';
  #files: Record<string, Blob> = {};
  #archive: JSZip | undefined;
  #workQueue: Promise<any>[] = [];

  constructor(name?: string);
  constructor(nodeOrQuerySelector: Node | string, callback: NodeTraversalFn);
  constructor(name: string, nodeOrQuerySelector: Node | string, callback: NodeTraversalFn);
  constructor(...args: any[]) {
    if (args.length === 0) return;
    else if (args.length === 1 && isNonEmptyString(args[0])) {
      // name-only constructor
      this.name = args[0];
      return;
    } else if (
      args.length === 2 &&
      isFunction(args[1]) &&
      (isNonEmptyString(args[0]) ||
        args[0] instanceof Node ||
        Array.isArray(args[0]) ||
        args[0] instanceof NodeList)
    ) {
      // DOM Traversal constructor
      return args[0] instanceof Node
        ? this.fromNode(args[0], args[1])
        : this.fromNodes(args[0], args[1]);
    } else if (
      args.length === 3 &&
      isNonEmptyString(args[0]) &&
      isFunction(args[2]) &&
      (isNonEmptyString(args[1]) ||
        args[1] instanceof Node ||
        Array.isArray(args[1]) ||
        args[1] instanceof NodeList)
    ) {
      // name + DOM traversal constructor
      this.name = args[0];
      return args[1] instanceof Node
        ? this.fromNode(args[1], args[2])
        : this.fromNodes(args[1], args[2]);
    }
  }

  public get name() {
    return this.#name;
  }

  public set name(next: string) {
    this.#name = sanitizeFilename(next);
  }

  public get files() {
    return { ...this.#files };
  }

  private get archive(): JSZip {
    return this.#archive ?? (this.#archive = this.createZip(this.#files));
  }

  public getSafePath(path: string, ignoringPaths: string[] = []): string {
    const basePath = sanitizeFilepath(path);
    const isDir = basePath.endsWith('/');
    let candidate = basePath;
    let counter = 1;

    const conflictsWithExistingDirectory = (filepath: string) => {
      if (isDir)
        return Object.prototype.hasOwnProperty.call(this.#files, filepath.replace(/\/+$/, ''));

      const dirPrefix = `${filepath}/`;
      for (const existingPath in this.#files) {
        if (!ignoringPaths.includes(existingPath) && existingPath.startsWith(dirPrefix))
          return true;
      }

      return false;
    };

    while (
      Object.prototype.hasOwnProperty.call(this.#files, candidate) ||
      conflictsWithExistingDirectory(candidate)
    ) {
      const suffix = ` (${counter++})`;
      if (isDir) {
        const trimmed = basePath.replace(/\/+$/, '');
        candidate = `${trimmed}${suffix}/`;
      } else {
        const lastSlash = basePath.lastIndexOf('/');
        const filename = basePath.slice(lastSlash + 1);
        const dir = lastSlash >= 0 ? basePath.slice(0, lastSlash + 1) : '';
        const dotIndex = filename.lastIndexOf('.');

        if (dotIndex > 0) {
          const baseName = filename.slice(0, dotIndex);
          const ext = filename.slice(dotIndex);
          candidate = `${dir}${baseName}${suffix}${ext}`;
        } else {
          candidate = `${dir}${filename}${suffix}`;
        }
      }
    }

    return candidate;
  }

  public fromNode(nodeOrSelector: Node | string, callback: NodeTraversalFn): ArchiveTool {
    const element = isNonEmptyString(nodeOrSelector)
      ? document.querySelector(nodeOrSelector)
      : nodeOrSelector;
    if (!element) {
      console.warn(`[ArchiveTool.fromNode] provided node was empty: `, nodeOrSelector);
      return this;
    }

    this.traverseNode(element, callback);
    return this;
  }

  public fromNodes(
    nodesOrSelector: string | Node[] | NodeList,
    callback: NodeTraversalFn,
    batchOptions: BatchDelayOptions = {},
  ) {
    let elements: Node[] | undefined;
    if (isNonEmptyString(nodesOrSelector))
      elements = Array.from(document.querySelectorAll(nodesOrSelector));
    else if (Array.isArray(nodesOrSelector)) elements = nodesOrSelector;
    else if (nodesOrSelector instanceof NodeList) elements = Array.from(nodesOrSelector);

    if (isNullish(elements) || elements.length === 0) {
      console.warn(`[ArchiveTool.fromNode] No elements found to traverse: `, nodesOrSelector);
      return this;
    }

    batchDelayForEach(elements, (node) => this.traverseNode(node!, callback), batchOptions);

    return this;
  }

  public setName(name: string) {
    this.name = name;
    return this;
  }

  public addFile(filepath: string, file: Blob) {
    filepath = this.getSafePath(filepath);
    this.#files[filepath] = file;
    this.markDirty();
    return this;
  }

  public addTextFile(filepath: string, text: string | HTMLElement) {
    if (isEmptyString(text)) {
      console.warn(`[ArchiveTool.addTextFile] Empty text content was provided for "${filepath}"`);
    }

    const content = isString(text)
      ? text
      : (isNonEmptyString(text.textContent) && text.textContent) ||
        (isNonEmptyString(text.outerHTML) && text.outerHTML) ||
        '';
    const mime = typeof text === 'string' ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8';

    return this.addFile(filepath, new Blob([content], { type: mime }));
  }

  public addImage(
    image: DownloadableImage,
    filepathOrOptions: string | DownloadImageOptions,
    directory?: string,
  ) {
    this.addToWorkQueue(() => this.addImageHelper(image, filepathOrOptions, directory));
    return this;
  }

  public addImages(
    images: (DownloadableImage | [DownloadableImage, NameOrDownloadImageOptions])[],
    options: BatchImageDownloadOptions = {},
    directory?: string,
  ) {
    const { batchSize = 5, delayMS = 500, ...defaults } = options ?? {};
    if (images instanceof NodeList) images = Array.from(images);

    this.addToWorkQueue(() =>
      batchDelayForEach(
        images,
        (entry) => {
          const [image, itemOptions] = Array.isArray(entry) ? entry : [entry!, undefined];
          const downloadOptions = mergeOptionsWithDefaults(itemOptions, defaults);
          return this.addToWorkQueue(() => this.addImageHelper(image, downloadOptions, directory));
        },
        { batchSize, delayMS },
      ),
    );

    return this;
  }

  public renameFile(path: string, newPath: string) {
    if (!(path in this.#files)) {
      console.warn(`[ArchiveTool.renameFile] "${path}" does not exist in archive`);
      return this;
    }

    newPath = this.getSafePath(newPath);

    const file = this.#files[path]!;
    this.#files[newPath] = file;
    delete this.#files[path];
  }

  public deleteFile(path: string, recursive = true): ArchiveTool {
    if (!(path in this.#files)) {
      console.warn(`[ArchiveTool.removeFile] "${path}" does not exist in archive`);
      return this;
    }

    const file = this.#files[path];
    if (file instanceof SubdirectoryHandle) file.deleteDirectory(recursive);
    delete this.#files[path];

    return this;
  }

  public getSubdirectory(filepath: string): Nullable<SubdirectoryHandle> {
    filepath = sanitizeFilepath(filepath);
    const subdirectory = (filepath in this.#files && this.#files[filepath]) || undefined;

    if (isDefined(subdirectory) && !(subdirectory instanceof SubdirectoryHandle)) {
      console.warn(`[ArchiveTool.getSubdirectory] "${filepath}" is not a directory`);
      return undefined;
    }

    return subdirectory ?? new SubdirectoryHandle(this, filepath);
  }

  private async completeWorkQueue() {
    while (this.#workQueue.length > 0) {
      const completedQueue = await Promise.allSettled(this.#workQueue);
      this.#workQueue.splice(0, completedQueue.length);
    }
  }

  public async toBlob(archive?: JSZip): Promise<Blob> {
    await this.completeWorkQueue();
    return (archive ?? this.archive).generateAsync({ type: 'blob' });
  }

  public async download(name?: string, data?: Blob) {
    const blob = data ?? (await this.toBlob());
    triggerDownload(blob, `${name ?? this.#name}.zip`);
  }

  public async downloadSubdirectory(path: string) {
    const subdirectory = this.getSubdirectory(path);
    if (!subdirectory) {
      console.warn(`[ArchiveTool.downloadSubdirectory] Could not download "${path}"`);
      return;
    }

    const archive = this.createZip(subdirectory.files);
    const blob = await this.toBlob(archive);
    await this.download(subdirectory.path.replace(/\//g, '__'), blob);
  }

  public addToWorkQueue(callback: () => Promise<any>): Promise<any> {
    const promise = callback();
    this.#workQueue.push(promise);
    return promise;
  }

  private markDirty() {
    this.#archive = undefined;
  }

  private createZip(files: Record<string, Blob>): JSZip {
    const fileEntries = Object.entries(files);
    if (fileEntries.length === 0) {
      console.warn(`[ArchiveTool.createZip] Requested archive does not contain any files`);
      return new JSZip();
    }

    const zip = new JSZip();
    fileEntries.forEach(([path, content]) => zip.file(path, content));
    return zip;
  }

  private async traverseNode(node: Node, callback: NodeTraversalFn) {
    return this.addToWorkQueue(() => callback(node, this));
  }

  private async addImageHelper(
    image: DownloadableImage,
    filepathOrOptions: string | DownloadImageOptions,
    directory?: string,
  ) {
    const downloadOptions = normalizeDownloadOptions(filepathOrOptions, image);

    try {
      const imageData = await imageToBlob(image, downloadOptions);
      const filepath = pathJoin(directory, imageData.name ?? 'image');
      this.addFile(filepath, imageData.blob);
    } catch (error) {
      console.warn(`[ArchiveTool.addImage] Failed to add image to archive`);
      console.warn(error);
    }
  }
}

class SubdirectoryHandle {
  #path: string;
  #parent: ArchiveTool;
  #isDeleted = false;

  constructor(archive: ArchiveTool, path: string) {
    this.#parent = archive;
    this.#path = path;
  }

  public get parent() {
    this.checkValidHandle();
    return this.#parent;
  }

  public get path() {
    this.checkValidHandle();
    return this.#path;
  }

  public get files(): Record<string, Blob> {
    this.checkValidHandle();
    return Object.fromEntries(
      Object.entries(this.#parent.files).filter(
        ([path]) => path.startsWith(this.#path) && path !== this.#path,
      ),
    );
  }

  public rename(path: string, recursive = true) {
    this.checkValidHandle();
    const affectedFiles = Object.entries(this.files);
    const newPath = this.#parent.getSafePath(
      path,
      affectedFiles.map(([path]) => path),
    );

    if (recursive)
      affectedFiles.forEach(([p, file]) => {
        const updatedFilePath = p.replace(new RegExp(`^${this.#path}`, 'm'), newPath);
        if (file instanceof SubdirectoryHandle) file.#path = updatedFilePath;
        this.parent.renameFile(p, updatedFilePath);
      });

    this.#path = newPath;
    return this;
  }

  public reparent(archive: ArchiveTool, newPath?: string) {
    this.checkValidHandle();
    newPath = archive.getSafePath(newPath ?? this.#path);
    const affectedFiles = Object.entries(this.files);

    affectedFiles.forEach(([path, file]) => {
      const updatedFilePath = path.replace(new RegExp(`^${this.#path}`, 'm'), newPath);
      archive.addFile(updatedFilePath, file);
      this.#parent.deleteFile(path, false);
    });

    this.#parent = archive;
    return this;
  }

  public deleteDirectory(recursive = true) {
    this.checkValidHandle();
    this.#isDeleted = true;

    const parent = this.#parent;
    this.#parent = null as any;
    if (!recursive) return parent;

    const files = parent.files;
    const affectedFiles = Object.keys(files).filter((path) => path.startsWith(this.#path));
    affectedFiles.forEach((path) => parent.deleteFile(path, false));
    return parent;
  }

  public addFile(relativePath: string, file: Blob) {
    this.checkValidHandle();
    this.#parent.addFile(this.asParentPath(relativePath), file);
    return this;
  }

  public addTextFile(relativePath: string, text: string | HTMLElement) {
    this.checkValidHandle();
    this.#parent.addTextFile(this.asParentPath(relativePath), text);
    return this;
  }

  public addImage(
    image: DownloadableImage,
    filepathOrOptions: string | DownloadImageOptions,
    relativeDirectory?: string,
  ) {
    this.#parent.addImage(image, filepathOrOptions, this.asParentPath(relativeDirectory));
    return this;
  }

  public addImages(
    images: (DownloadableImage | [DownloadableImage, NameOrDownloadImageOptions])[],
    options: BatchImageDownloadOptions = {},
    relativeDirectory?: string,
  ) {
    this.#parent.addImages(images, options, this.asParentPath(relativeDirectory));
    return this;
  }

  public renameFile(oldRelativePath: string, newRelativePath: string) {
    this.checkValidHandle();
    this.parent.renameFile(this.asParentPath(oldRelativePath), this.asParentPath(newRelativePath));
    return this;
  }

  public getSubdirectory(relativePath: string): Nullable<SubdirectoryHandle> {
    this.checkValidHandle();
    return this.#parent.getSubdirectory(this.asParentPath(relativePath));
  }

  public async downloadSubdirectory(relativePath: string) {
    this.checkValidHandle();
    return this.#parent.downloadSubdirectory(this.asParentPath(relativePath));
  }

  public deleteFile(relativePathOrFileName: string) {
    this.checkValidHandle();
    const files = this.files;
    const candidates = Object.keys(files).filter((path) => path.endsWith(relativePathOrFileName));
    if (candidates.length === 0) {
      console.warn(
        `[ArchiveSubdirectory] No files found matching "${relativePathOrFileName}" in ${this.#path}`,
      );
      return;
    } else if (candidates.length > 1) {
      console.warn(
        `[ArchiveSubdirectory] Could not disambiguate "${relativePathOrFileName}" in ${this.#path}. Found: ${candidates.map((c) => `"${c}"`).join(', ')}`,
      );
      return;
    }

    this.parent.deleteFile(candidates[0]!);
    return this;
  }

  public async download() {
    return this.#parent.downloadSubdirectory(this.#path);
  }

  private checkValidHandle() {
    if (this.#isDeleted)
      throw `[ArchiveSubdirectory] This subdirectory handle for "${this.#path}" has been deleted and can no longer be accessed.`;
  }

  private asParentPath(relativePath?: string): string {
    return isNonEmptyString(relativePath) ? pathJoin(this.#path, relativePath) : this.#path;
  }
}
