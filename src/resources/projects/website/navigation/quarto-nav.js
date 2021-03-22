window.document.addEventListener("DOMContentLoaded", function() {
  
  function throttle(func, wait) {
    var timeout;
    return function() {
      const context = this
      const args = arguments;
      const later = function() {
        clearTimeout(timeout);
        timeout = null;
        func.apply(context, args);
      };

      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
    };
  }

  function headerOffset() {
    // Set an offset if there is are fixed top navbar
    const headerEl = window.document.querySelector('header.fixed-top');
    return headerEl.clientHeight;
  }

  function updateDocumentOffsetWithoutAnimation() {
    updateDocumentOffset(false);
  }

  function updateDocumentOffset(animated) {
    // set body offset
    const offset = headerOffset()
    const bodyEl = window.document.body;
    bodyEl.setAttribute("data-bs-offset", offset);
    bodyEl.style.paddingTop = offset + "px";  

    // deal with sidebar offsets
    const sidebars = window.document.querySelectorAll(".sidebar");
    sidebars.forEach(sidebar => { 
      sidebar.classList.remove("notransition")
      if (!animated) {
        sidebar.classList.add("notransition");
      }

      if (window.Headroom && sidebar.classList.contains("sidebar-unpinned")) {
        sidebar.style.top = "0";
        sidebar.style.maxHeight = '100vh';   
      } else {
        sidebar.style.top = offset + "px";
        sidebar.style.maxHeight = 'calc(100vh - ' + offset + 'px)';   
      }
    });

    // link offset
    let linkStyle = window.document.querySelector("#quarto-target-style");
    if (!linkStyle) {
      linkStyle = window.document.createElement('style');
      window.document.head.appendChild(linkStyle);
    }
    while (linkStyle.firstChild) {
      linkStyle.removeChild(linkStyle.firstChild);
    }
    linkStyle.appendChild(window.document.createTextNode(`
      :target::before {
        content: "";
        display: block;
        height: ${offset}px;
        margin: -${offset}px 0 0;
      }`)
    );
  }

  // initialize headroom
  var header = window.document.querySelector("#quarto-header");
  if (header && window.Headroom) {
    const headroom  = new window.Headroom(header, 
      { tolerance: 5,
        onPin: function() {
          const sidebars = window.document.querySelectorAll(".sidebar");
          sidebars.forEach(sidebar => {
            sidebar.classList.remove("sidebar-unpinned");
          });
          updateDocumentOffset();
        }, 
        onUnpin: function() {
          const sidebars = window.document.querySelectorAll(".sidebar");
          sidebars.forEach(sidebar => {
            sidebar.classList.add("sidebar-unpinned");
          });
          updateDocumentOffset();
        }});
    headroom.init();

    let frozen = false;
    window.quartoToggleHeadroom = function () {
      if (frozen) {
        headroom.unfreeze();
        frozen = false;
      } else {
        headroom.freeze();
        frozen = true;
      }
    }
  }

  // Observe size changed for the header
  const headerEl = window.document.querySelector('header.fixed-top');
  if (window.ResizeObserver) {
    const observer = new window.ResizeObserver(throttle(updateDocumentOffsetWithoutAnimation, 50));
    observer.observe(headerEl, { attributes: true, childList: true, characterData: true });
  } else {
    window.addEventListener('resize', throttle(updateDocumentOffsetWithoutAnimation, 50));  
    setTimeout(updateDocumentOffsetWithoutAnimation, 500);
  }

   // fixup index.html links if we aren't on the filesystem
   if (window.location.protocol !== "file:") {
    const links = window.document.querySelectorAll("a");
    for (let i=0; i<links.length; i++) {
      links[i].href = links[i].href.replace(/\/index\.html/, "/");
    }
  }
});

