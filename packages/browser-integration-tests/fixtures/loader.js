!function(n,e,r,t,i,o,a,c,u){for(var s=u,f=0;f<document.scripts.length;f++)if(document.scripts[f].src.indexOf(o)>-1){s&&"no"===document.scripts[f].getAttribute("data-lazy")&&(s=!1);break}var p=[];function l(n){return"e"in n}function d(n){return"p"in n}function _(n){return"f"in n}var v=[],h=function(n){s&&(l(n)||d(n)||_(n)&&n.f.indexOf("capture")>-1||_(n)&&n.f.indexOf("showReportDialog")>-1)&&O(),v.push(n)};function y(){h({e:[].slice.call(arguments)})}function E(n){h({p:"reason"in n?n.reason:"detail"in n&&"reason"in n.detail?n.detail.reason:n})}function m(){try{n.SENTRY_SDK_SOURCE="loader";var e=n[i],o=e.init;e.init=function(i){n.removeEventListener(r,y),n.removeEventListener(t,E);var a=c;for(var u in i)Object.prototype.hasOwnProperty.call(i,u)&&(a[u]=i[u]);!function(n,e){var r=n.integrations||[];if(!Array.isArray(r))return;var t=r.map((function(n){return n.name}));n.tracesSampleRate&&-1===t.indexOf("BrowserTracing")&&r.push(new e.BrowserTracing);(n.replaysSessionSampleRate||n.replaysOnErrorSampleRate)&&-1===t.indexOf("Replay")&&r.push(new e.Replay);n.integrations=r}(a,e),o(a)},setTimeout((function(){return function(e){try{for(var r=0;r<p.length;r++)"function"==typeof p[r]&&p[r]();for(r=0;r<v.length;r++){_(o=v[r])&&"init"===o.f&&e.init.apply(e,o.a)}R()||e.init();var t=n.onerror,i=n.onunhandledrejection;for(r=0;r<v.length;r++){var o;if(_(o=v[r])){if("init"===o.f)continue;e[o.f].apply(e,o.a)}else l(o)&&t?t.apply(n,o.e):d(o)&&i&&i.apply(n,[o.p])}}catch(n){console.error(n)}}(e)}))}catch(n){console.error(n)}}var g=!1;function O(){if(!g){g=!0;var n=e.scripts[0],r=e.createElement("script");r.src=a,r.crossOrigin="anonymous",r.addEventListener("load",m,{once:!0,passive:!0}),n.parentNode.insertBefore(r,n)}}function R(){var e=n.__SENTRY__;return!(void 0===e||!e.hub||!e.hub.getClient())}n[i]=n[i]||{},n[i].onLoad=function(n){R()?n():p.push(n)},n[i].forceLoad=function(){setTimeout((function(){O()}))},["init","addBreadcrumb","captureMessage","captureException","captureEvent","configureScope","withScope","showReportDialog"].forEach((function(e){n[i][e]=function(){h({f:e,a:arguments})}})),n.addEventListener(r,y),n.addEventListener(t,E),s||setTimeout((function(){O()}))}
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
