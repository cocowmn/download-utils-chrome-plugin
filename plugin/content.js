const scripts = [
  // start script list
  'image-downloader',
  // end script list
].map((script) => `modules/${script}.js`);

main();

async function main() {
  try {
    scripts.forEach((script) => loadScript(script, true));
  } catch (error) {
    // cannot load hard-coded dependencies. This should not occur; it means one of the files
    // has been deleted and this script was not updated
    console.error(`failed to load dependencies`, error);
  }
}

function loadScript(src, isModule = false) {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL(src);
  script.defer = true;
  if (isModule) script.type = 'module';
  document.head.appendChild(script);
}
