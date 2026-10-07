/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "instrumentation";
exports.ids = ["instrumentation"];
exports.modules = {

/***/ "(instrument)/./instrumentation.ts":
/*!****************************!*\
  !*** ./instrumentation.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   onRequestError: () => (/* binding */ onRequestError),\n/* harmony export */   register: () => (/* binding */ register)\n/* harmony export */ });\n/* harmony import */ var _sentry_nextjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @sentry/nextjs */ \"(instrument)/./node_modules/@sentry/nextjs/build/cjs/index.server.js\");\n/* harmony import */ var _sentry_nextjs__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_sentry_nextjs__WEBPACK_IMPORTED_MODULE_0__);\nglobalThis[\"_sentryRewritesTunnelPath\"] = undefined;\nglobalThis[\"SENTRY_RELEASE\"] = undefined;\nglobalThis[\"_sentryBasePath\"] = undefined;\nglobalThis[\"_sentryNextJsVersion\"] = \"15.2.6\";\nglobalThis[\"_sentryRewriteFramesDistDir\"] = \".next-mobile-test\";\nglobalThis[\"_sentryVercelCronsConfig\"] = undefined;\n\nasync function register() {\n    if (true) {\n        await __webpack_require__.e(/*! import() */ \"_instrument_sentry_server_config_ts\").then(__webpack_require__.bind(__webpack_require__, /*! ./sentry.server.config */ \"(instrument)/./sentry.server.config.ts\"));\n    }\n    if (false) {}\n}\nconst onRequestError = _sentry_nextjs__WEBPACK_IMPORTED_MODULE_0__.captureRequestError;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vaW5zdHJ1bWVudGF0aW9uLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQ0EsVUFBVSxDQUFDLDRCQUE0QixHQUFHQztBQUFVRCxVQUFVLENBQUMsaUJBQWlCLEdBQUdDO0FBQVVELFVBQVUsQ0FBQyxrQkFBa0IsR0FBR0M7QUFBVUQsVUFBVSxDQUFDLHVCQUF1QixHQUFHO0FBQVNBLFVBQVUsQ0FBQyw4QkFBOEIsR0FBRztBQUFvQkEsVUFBVSxDQUFDLDJCQUEyQixHQUFHQztBQUFrRDtBQUUxVSxlQUFlRTtJQUNwQixJQUFJQyxJQUFxQyxFQUFFO1FBQ3pDLE1BQU0sd01BQWdDO0lBQ3hDO0lBQ0EsSUFBSUEsS0FBbUMsRUFBRSxFQUV4QztBQUNIO0FBRU8sTUFBTUcsaUJBQWlCTCwrREFBMEIiLCJzb3VyY2VzIjpbIi9Vc2Vycy9jb2RlLXdpdGgtYS9EZXYvRk9NL25leHQtanMvaW5zdHJ1bWVudGF0aW9uLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIjtnbG9iYWxUaGlzW1wiX3NlbnRyeVJld3JpdGVzVHVubmVsUGF0aFwiXSA9IHVuZGVmaW5lZDtnbG9iYWxUaGlzW1wiU0VOVFJZX1JFTEVBU0VcIl0gPSB1bmRlZmluZWQ7Z2xvYmFsVGhpc1tcIl9zZW50cnlCYXNlUGF0aFwiXSA9IHVuZGVmaW5lZDtnbG9iYWxUaGlzW1wiX3NlbnRyeU5leHRKc1ZlcnNpb25cIl0gPSBcIjE1LjIuNlwiO2dsb2JhbFRoaXNbXCJfc2VudHJ5UmV3cml0ZUZyYW1lc0Rpc3REaXJcIl0gPSBcIi5uZXh0LW1vYmlsZS10ZXN0XCI7Z2xvYmFsVGhpc1tcIl9zZW50cnlWZXJjZWxDcm9uc0NvbmZpZ1wiXSA9IHVuZGVmaW5lZDtpbXBvcnQgKiBhcyBTZW50cnkgZnJvbSBcIkBzZW50cnkvbmV4dGpzXCJcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlZ2lzdGVyKCkge1xuICBpZiAocHJvY2Vzcy5lbnYuTkVYVF9SVU5USU1FID09PSBcIm5vZGVqc1wiKSB7XG4gICAgYXdhaXQgaW1wb3J0KFwiLi9zZW50cnkuc2VydmVyLmNvbmZpZ1wiKVxuICB9XG4gIGlmIChwcm9jZXNzLmVudi5ORVhUX1JVTlRJTUUgPT09IFwiZWRnZVwiKSB7XG4gICAgYXdhaXQgaW1wb3J0KFwiLi9zZW50cnkuZWRnZS5jb25maWdcIilcbiAgfVxufVxuXG5leHBvcnQgY29uc3Qgb25SZXF1ZXN0RXJyb3IgPSBTZW50cnkuY2FwdHVyZVJlcXVlc3RFcnJvclxuIl0sIm5hbWVzIjpbImdsb2JhbFRoaXMiLCJ1bmRlZmluZWQiLCJTZW50cnkiLCJyZWdpc3RlciIsInByb2Nlc3MiLCJlbnYiLCJORVhUX1JVTlRJTUUiLCJvblJlcXVlc3RFcnJvciIsImNhcHR1cmVSZXF1ZXN0RXJyb3IiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(instrument)/./instrumentation.ts\n");

/***/ }),

/***/ "(instrument)/./node_modules/@fastify/otel/node_modules/@opentelemetry/instrumentation/build/esm/platform/node sync recursive":
/*!**************************************************************************************************************!*\
  !*** ./node_modules/@fastify/otel/node_modules/@opentelemetry/instrumentation/build/esm/platform/node/ sync ***!
  \**************************************************************************************************************/
/***/ ((module) => {

function webpackEmptyContext(req) {
	var e = new Error("Cannot find module '" + req + "'");
	e.code = 'MODULE_NOT_FOUND';
	throw e;
}
webpackEmptyContext.keys = () => ([]);
webpackEmptyContext.resolve = webpackEmptyContext;
webpackEmptyContext.id = "(instrument)/./node_modules/@fastify/otel/node_modules/@opentelemetry/instrumentation/build/esm/platform/node sync recursive";
module.exports = webpackEmptyContext;

/***/ }),

/***/ "(instrument)/./node_modules/@prisma/instrumentation/node_modules/@opentelemetry/instrumentation/build/esm/platform/node sync recursive":
/*!************************************************************************************************************************!*\
  !*** ./node_modules/@prisma/instrumentation/node_modules/@opentelemetry/instrumentation/build/esm/platform/node/ sync ***!
  \************************************************************************************************************************/
/***/ ((module) => {

function webpackEmptyContext(req) {
	var e = new Error("Cannot find module '" + req + "'");
	e.code = 'MODULE_NOT_FOUND';
	throw e;
}
webpackEmptyContext.keys = () => ([]);
webpackEmptyContext.resolve = webpackEmptyContext;
webpackEmptyContext.id = "(instrument)/./node_modules/@prisma/instrumentation/node_modules/@opentelemetry/instrumentation/build/esm/platform/node sync recursive";
module.exports = webpackEmptyContext;

/***/ }),

/***/ "async_hooks":
/*!******************************!*\
  !*** external "async_hooks" ***!
  \******************************/
/***/ ((module) => {

"use strict";
module.exports = require("async_hooks");

/***/ }),

/***/ "child_process":
/*!********************************!*\
  !*** external "child_process" ***!
  \********************************/
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("crypto");

/***/ }),

/***/ "diagnostics_channel":
/*!**************************************!*\
  !*** external "diagnostics_channel" ***!
  \**************************************/
/***/ ((module) => {

"use strict";
module.exports = require("diagnostics_channel");

/***/ }),

/***/ "events":
/*!*************************!*\
  !*** external "events" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("events");

/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ "import-in-the-middle":
/*!***************************************!*\
  !*** external "import-in-the-middle" ***!
  \***************************************/
/***/ ((module) => {

"use strict";
module.exports = require("import-in-the-middle");

/***/ }),

/***/ "module":
/*!*************************!*\
  !*** external "module" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("module");

/***/ }),

/***/ "node:child_process":
/*!*************************************!*\
  !*** external "node:child_process" ***!
  \*************************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:child_process");

/***/ }),

/***/ "node:diagnostics_channel":
/*!*******************************************!*\
  !*** external "node:diagnostics_channel" ***!
  \*******************************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:diagnostics_channel");

/***/ }),

/***/ "node:events":
/*!******************************!*\
  !*** external "node:events" ***!
  \******************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:events");

/***/ }),

/***/ "node:fs":
/*!**************************!*\
  !*** external "node:fs" ***!
  \**************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:fs");

/***/ }),

/***/ "node:http":
/*!****************************!*\
  !*** external "node:http" ***!
  \****************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:http");

/***/ }),

/***/ "node:https":
/*!*****************************!*\
  !*** external "node:https" ***!
  \*****************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:https");

/***/ }),

/***/ "node:inspector":
/*!*********************************!*\
  !*** external "node:inspector" ***!
  \*********************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:inspector");

/***/ }),

/***/ "node:net":
/*!***************************!*\
  !*** external "node:net" ***!
  \***************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:net");

/***/ }),

/***/ "node:os":
/*!**************************!*\
  !*** external "node:os" ***!
  \**************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:os");

/***/ }),

/***/ "node:path":
/*!****************************!*\
  !*** external "node:path" ***!
  \****************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:path");

/***/ }),

/***/ "node:readline":
/*!********************************!*\
  !*** external "node:readline" ***!
  \********************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:readline");

/***/ }),

/***/ "node:stream":
/*!******************************!*\
  !*** external "node:stream" ***!
  \******************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:stream");

/***/ }),

/***/ "node:tls":
/*!***************************!*\
  !*** external "node:tls" ***!
  \***************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:tls");

/***/ }),

/***/ "node:util":
/*!****************************!*\
  !*** external "node:util" ***!
  \****************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:util");

/***/ }),

/***/ "node:worker_threads":
/*!**************************************!*\
  !*** external "node:worker_threads" ***!
  \**************************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:worker_threads");

/***/ }),

/***/ "node:zlib":
/*!****************************!*\
  !*** external "node:zlib" ***!
  \****************************/
/***/ ((module) => {

"use strict";
module.exports = require("node:zlib");

/***/ }),

/***/ "os":
/*!*********************!*\
  !*** external "os" ***!
  \*********************/
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ "perf_hooks":
/*!*****************************!*\
  !*** external "perf_hooks" ***!
  \*****************************/
/***/ ((module) => {

"use strict";
module.exports = require("perf_hooks");

/***/ }),

/***/ "process":
/*!**************************!*\
  !*** external "process" ***!
  \**************************/
/***/ ((module) => {

"use strict";
module.exports = require("process");

/***/ }),

/***/ "require-in-the-middle":
/*!****************************************!*\
  !*** external "require-in-the-middle" ***!
  \****************************************/
/***/ ((module) => {

"use strict";
module.exports = require("require-in-the-middle");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/***/ ((module) => {

"use strict";
module.exports = require("url");

/***/ }),

/***/ "util":
/*!***********************!*\
  !*** external "util" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("util");

/***/ }),

/***/ "worker_threads":
/*!*********************************!*\
  !*** external "worker_threads" ***!
  \*********************************/
/***/ ((module) => {

"use strict";
module.exports = require("worker_threads");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("./webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/@opentelemetry","vendor-chunks/@sentry","vendor-chunks/@prisma","vendor-chunks/@fastify","vendor-chunks/minimatch","vendor-chunks/next","vendor-chunks/forwarded-parse","vendor-chunks/@swc","vendor-chunks/brace-expansion","vendor-chunks/balanced-match","vendor-chunks/stacktrace-parser","vendor-chunks/module-details-from-path"], () => (__webpack_exec__("(instrument)/./instrumentation.ts")));
module.exports = __webpack_exports__;

})();