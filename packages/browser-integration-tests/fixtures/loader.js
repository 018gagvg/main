!function(n,e,t,r,i,o,a,c,s){for(var f=s,forceLoad=!1,u=0;u<document.scripts.length;u++)if(document.scripts[u].src.indexOf(o)>-1){f&&"no"===document.scripts[u].getAttribute("data-lazy")&&(f=!1);break}var p=!1,d=[],l=function(n){("e"in n||"p"in n||n.f&&n.f.indexOf("capture")>-1||n.f&&n.f.indexOf("showReportDialog")>-1)&&f&&E(d),l.data.push(n)};function _(){l({e:[].slice.call(arguments)})}function v(n){l({p:"reason"in n?n.reason:"detail"in n&&"reason"in n.detail?n.detail.reason:n})}function h(){var e=n.__SENTRY__;return!!(e&&e.hub&&e.hub.getClient&&e.hub.getClient())}function E(o){if(!p&&!h()){p=!0;var s=e.scripts[0],f=e.createElement("script");f.src=a,f.crossOrigin="anonymous",f.addEventListener("load",(function(){try{n.removeEventListener(t,_),n.removeEventListener(r,v),n.SENTRY_SDK_SOURCE="loader";var e=n[i],a=e.init;e.init=function(n){var t=c;for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&(t[r]=n[r]);!function(n,e){var t=n.integrations||[];if(!Array.isArray(t))return;var r=t.map((function(n){return n.name}));n.tracesSampleRate&&-1===r.indexOf("BrowserTracing")&&t.push(new e.BrowserTracing);(n.replaysSessionSampleRate||n.replaysOnErrorSampleRate)&&-1===r.indexOf("Replay")&&t.push(new e.Replay);n.integrations=t}(t,e),a(t)},function(e,t){try{for(var r=0;r<e.length;r++)"function"==typeof e[r]&&e[r]();var i=l.data,o=h();i.sort((function(n){return"init"===n.f?-1:0}));var a=!1;for(r=0;r<i.length;r++)if(i[r].f){a=!0;var c=i[r];!1===o&&"init"!==c.f&&t.init(),o=!0,t[c.f].apply(t,c.a)}!1===o&&!1===a&&t.init();var s=n.onerror,f=n.onunhandledrejection;for(r=0;r<i.length;r++)"e"in i[r]&&s?s.apply(n,i[r].e):"p"in i[r]&&f&&f.apply(n,[i[r].p])}catch(n){console.error(n)}}(o,e)}catch(n){console.error(n)}})),s.parentNode.insertBefore(f,s)}}l.data=[],n[i]=n[i]||{},n[i].onLoad=function(n){d.push(n),f&&!forceLoad||E(d)},n[i].forceLoad=function(){forceLoad=!0,f&&setTimeout((function(){E(d)}))},["init","addBreadcrumb","captureMessage","captureException","captureEvent","configureScope","withScope","showReportDialog"].forEach((function(e){n[i][e]=function(){l({f:e,a:arguments})}})),n.addEventListener(t,_),n.addEventListener(r,v),f||setTimeout((function(){E(d)}))}
(
  window,
  document,
  'error',
  'unhandledrejection',
  'Sentry',
  'loader.js',
  __LOADER_BUNDLE__,
  __LOADER_OPTIONS__,
  __LOADER_LAZY__
);
