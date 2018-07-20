export interface StackFrame {
  url: string;
  func: string;
  args: string[];
  line: number;
  column: number;
  context: string[];
}

export interface StackTrace {
  /**
   * Known modes: callers, failed, multiline, onerror, stack, stacktrace
   */
  mode: string;
  name: string;
  message: string;
  url: string;
  stack: StackFrame[];
  useragent: string;
}

interface ComputeStackTrace {
  /**
   * Computes a stack trace for an exception.
   * @param {Error} ex
   * @param {(string|number)=} depth
   */
  (ex: Error, depth?: string | number): StackTrace;

  /**
   * Adds information about the first frame to incomplete stack traces.
   * Safari and IE require this to get complete data on the first frame.
   * @param {Object.<string, *>} stackInfo Stack trace information from
   * one of the compute* methods.
   * @param {string} url The URL of the script that caused an error.
   * @param {(number|string)} lineNo The line number of the script that
   * caused an error.
   * @param {string=} message The error generated by the browser, which
   * hopefully contains the name of the object that caused the error.
   * @return {boolean} Whether or not the stack information was
   * augmented.
   */
  augmentStackTraceWithInitialElement: (
    stackInfo: string,
    url: string,
    lineNo: string | number,
    message?: string,
  ) => boolean;

  /**
   * Tries to use an externally loaded copy of source code to determine
   * the name of a function by looking at the name of the variable it was
   * assigned to, if any.
   * @param {string} url URL of source code.
   * @param {(string|number)} lineNo Line number in source code.
   * @return {string} The function name, if discoverable.
   */
  guessFunctionName: (url: string, lineNo: string | number) => string;

  /**
   * Retrieves the surrounding lines from where an exception occurred.
   * @param {string} url URL of source code.
   * @param {(string|number)} line Line number in source code to centre
   * around for context.
   * @return {?Array.<string>} Lines of source code.
   */
  gatherContext: (url: string, line: string | number) => string[];

  /**
   * Logs a stacktrace starting from the previous call and working down.
   * @param {(number|string)=} depth How many frames deep to trace.
   * @return {Object.<string, *>} Stack trace information.
   */
  ofCaller: (depth?: string | number) => StackTrace;

  /**
   * Retrieves source code from the source code cache.
   * @param {string} url URL of source code.
   * @return {Array.<string>} Source contents.
   */
  getSource: (url: string) => string[];
}

interface ReportSubscriber {
  (stackTrace: StackTrace, isWindowError: boolean, error: any): void;
}

interface Report {
  /**
   * Reports an unhandled Error to TraceKit.
   * @param {Error} ex
   */
  (ex: Error): void;

  /**
   * Add a crash handler.
   * @param {Function} handler
   */
  subscribe(handler: ReportSubscriber): void;

  /**
   * Remove a crash handler.
   * @param {Function} handler
   */
  unsubscribe(handler: ReportSubscriber): void;
}

/**
 * TraceKit.computeStackTrace: cross-browser stack traces in JavaScript
 *
 * Syntax:
 *   s = TraceKit.computeStackTrace.ofCaller([depth])
 *   s = TraceKit.computeStackTrace(exception) // consider using TraceKit.report instead (see below)
 * Returns:
 *   s.name              - exception name
 *   s.message           - exception message
 *   s.stack[i].url      - JavaScript or HTML file URL
 *   s.stack[i].func     - function name, or empty for anonymous functions (if guessing did not work)
 *   s.stack[i].args     - arguments passed to the function, if known
 *   s.stack[i].line     - line number, if known
 *   s.stack[i].column   - column number, if known
 *   s.stack[i].context  - an array of source code lines; the middle element corresponds to the correct line#
 *   s.mode              - 'stack', 'stacktrace', 'multiline', 'callers', 'onerror', or 'failed' -- method used to collect the stack trace
 *
 * Supports:
 *   - Firefox:  full stack trace with line numbers and unreliable column
 *               number on top frame
 *   - Opera 10: full stack trace with line and column numbers
 *   - Opera 9-: full stack trace with line numbers
 *   - Chrome:   full stack trace with line and column numbers
 *   - Safari:   line and column number for the topmost stacktrace element
 *               only
 *   - IE:       no line numbers whatsoever
 *
 * Tries to guess names of anonymous functions by looking for assignments
 * in the source code. In IE and Safari, we have to guess source file names
 * by searching for function bodies inside all page scripts. This will not
 * work for scripts that are loaded cross-domain.
 * Here be dragons: some function names may be guessed incorrectly, and
 * duplicate functions may be mismatched.
 *
 * TraceKit.computeStackTrace should only be used for tracing purposes.
 * Logging of unhandled exceptions should be done with TraceKit.report,
 * which builds on top of TraceKit.computeStackTrace and provides better
 * IE support by utilizing the window.onerror event to retrieve information
 * about the top of the stack.
 *
 * Note: In IE and Safari, no stack trace is recorded on the Error object,
 * so computeStackTrace instead walks its *own* chain of callers.
 * This means that:
 *  * in Safari, some methods may be missing from the stack trace;
 *  * in IE, the topmost function in the stack trace will always be the
 *    caller of computeStackTrace.
 *
 * This is okay for tracing (because you are likely to be calling
 * computeStackTrace from the function you want to be the topmost element
 * of the stack trace anyway), but not okay for logging unhandled
 * exceptions (because your catch block will likely be far away from the
 * inner function that actually caused the exception).
 *
 * Tracing example:
 *     function trace(message) {
 *         var stackInfo = TraceKit.computeStackTrace.ofCaller();
 *         var data = message + "\n";
 *         for(var i in stackInfo.stack) {
 *             var item = stackInfo.stack[i];
 *             data += (item.func || '[anonymous]') + "() in " + item.url + ":" + (item.line || '0') + "\n";
 *         }
 *         if (window.console)
 *             console.info(data);
 *         else
 *             alert(data);
 *     }
 */
export declare var computeStackTrace: ComputeStackTrace;

/**
 * Extends support for global error handling for asynchronous browser
 * functions. Adopted from Closure Library's errorhandler.js
 */
export declare function extendToAsynchronousCallbacks(): ComputeStackTrace;

/**
 * TraceKit.noConflict: Export TraceKit out to another variable
 * Example: var TK = TraceKit.noConflict()
 */
export declare function noConflict(): void;

/**
 * TraceKit.wrap: Wrap any function in a TraceKit reporter
 * Example: func = TraceKit.wrap(func);
 *
 * @param {Function} func Function to be wrapped
 * @return {Function} The wrapped func
 */
export declare function wrap(func: () => void): () => void;

/**
 * TraceKit.report: cross-browser processing of unhandled exceptions
 *
 * Syntax:
 *   TraceKit.report.subscribe(function(stackInfo) { ... })
 *   TraceKit.report.unsubscribe(function(stackInfo) { ... })
 *   TraceKit.report(exception)
 *   try { ...code... } catch(ex) { TraceKit.report(ex); }
 *
 * Supports:
 *   - Firefox: full stack trace with line numbers, plus column number
 *              on top frame; column number is not guaranteed
 *   - Opera:   full stack trace with line and column numbers
 *   - Chrome:  full stack trace with line and column numbers
 *   - Safari:  line and column number for the top frame only; some frames
 *              may be missing, and column number is not guaranteed
 *   - IE:      line and column number for the top frame only; some frames
 *              may be missing, and column number is not guaranteed
 *
 * In theory, TraceKit should work on all of the following versions:
 *   - IE5.5+ (only 8.0 tested)
 *   - Firefox 0.9+ (only 3.5+ tested)
 *   - Opera 7+ (only 10.50 tested; versions 9 and earlier may require
 *     Exceptions Have Stacktrace to be enabled in opera:config)
 *   - Safari 3+ (only 4+ tested)
 *   - Chrome 1+ (only 5+ tested)
 *   - Konqueror 3.5+ (untested)
 *
 * Requires TraceKit.computeStackTrace.
 *
 * Tries to catch all unhandled exceptions and report them to the
 * subscribed handlers. Please note that TraceKit.report will rethrow the
 * exception. This is REQUIRED in order to get a useful stack trace in IE.
 * If the exception does not reach the top of the browser, you will only
 * get a stack trace from the point where TraceKit.report was called.
 *
 * Handlers receive a stackInfo object as described in the
 * TraceKit.computeStackTrace docs.
 */
export declare var report: Report;

export declare var remoteFetching: boolean;
export declare var collectWindowErrors: boolean;
export declare var linesOfContext: boolean;

export declare var subscribe: (handler: (stack: StackTrace, isWindowError: boolean, error: Error) => void) => void;
export declare var installGlobalHandler: () => void;
export declare var installGlobalUnhandledRejectionHandler: () => void;
