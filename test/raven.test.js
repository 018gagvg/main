function flushRavenState() {
  cachedAuth = undefined;
  hasJSON = !isUndefined(window.JSON);
  globalServer = undefined;
  globalUser = undefined;
  globalProject = undefined;
  globalOptions = {
    logger: 'javascript',
    ignoreErrors: [],
    ignoreUrls: []
  };
  Raven.uninstall();
}

var imageCache = [];
window.Image = function Image() {
  imageCache.push(this);
};

var SENTRY_DSN = 'http://abc@example.com:80/2';

function setupRaven() {
  Raven.config(SENTRY_DSN);
}

TraceKit.remoteFetching = false;

describe('globals', function() {
  afterEach(function() {
    flushRavenState();
  });

  describe('getHttpData', function() {
    var data = getHttpData();

    it('should have a url', function() {
        assert.equal(data.url, window.location.protocol + '//' + window.location.host + window.location.pathname);
    });

    it('should have a querystring', function() {
      assert.equal(data.querystring, window.location.search.slice(1));
    });

    it('should have the user-agent header', function() {
      assert.equal(data.headers['User-Agent'], navigator.userAgent);
    });

    it('should have referer header when available', function() {
      // lol this test is awful
      if (window.document.referrer) {
        assert.equal(data.headers.Referer, window.document.referrer);
      } else {
        assert.isUndefined(data.headers.Referer);
      }
    });

  });

  describe('isUndefined', function() {
    it('should do as advertised', function() {
      assert.isTrue(isUndefined());
      assert.isFalse(isUndefined({}));
      assert.isFalse(isUndefined(''));
      assert.isTrue(isUndefined(undefined));
    });
  });

  describe('isFunction', function() {
    it('should do as advertised', function() {
      assert.isTrue(isFunction(function(){}));
      assert.isFalse(isFunction({}));
      assert.isFalse(isFunction(''));
      assert.isFalse(isFunction(undefined));
    });
  });

  describe('isSetup', function() {
    it('should return false with no JSON support', function() {
      globalServer = 'http://localhost/';
      hasJSON = false;
      assert.isFalse(isSetup());
    });

    it('should return false when Raven is not configured and write to console.error', function() {
      hasJSON = true;  // be explicit
      globalServer = undefined;
      sinon.stub(console, 'error');
      assert.isFalse(isSetup());
      assert.isTrue(console.error.calledOnce);
      console.error.restore();
    });

    it('should return true when everything is all gravy', function() {
      hasJSON = true;
      setupRaven();
      assert.isTrue(isSetup());
    });
  });

  describe('getAuthQueryString', function() {
    it('should return a properly formatted string and cache it', function() {
      setupRaven();
      var expected = '?sentry_version=2.0&sentry_client=raven-js/@VERSION&sentry_key=abc';
      assert.strictEqual(getAuthQueryString(), expected);
      assert.strictEqual(cachedAuth, expected);
    });

    it('should return cached value when it exists', function() {
      cachedAuth = 'lol';
      assert.strictEqual(getAuthQueryString(), 'lol');
    });
  });

  describe('parseUri', function() {
    it('should do what it advertises', function() {
      var pieces = parseUri(SENTRY_DSN);
      assert.strictEqual(pieces.protocol, 'http');
      assert.strictEqual(pieces.user, 'abc');
      assert.strictEqual(pieces.port, '80');
      assert.strictEqual(pieces.path, '/2');
      assert.strictEqual(pieces.host, 'example.com');
    });
  });

  describe('normalizeFrame', function() {
    it('should handle a normal frame', function() {
      var context = [
        ['line1'],  // pre
        'line2',    // culprit
        ['line3']   // post
      ];
      sinon.stub(window, 'extractContextFromFrame').returns(context);
      var frame = {
        url: 'http://example.com/path/file.js',
        line: 10,
        column: 11,
        func: 'lol'
        // context: []  context is stubbed
      };

      assert.deepEqual(normalizeFrame(frame), {
        abs_path: 'http://example.com/path/file.js',
        filename: 'file.js',
        lineno: 10,
        colno: 11,
        'function': 'lol',
        pre_context: ['line1'],
        context_line: 'line2',
        post_context: ['line3'],
        in_app: true
      });
      window.extractContextFromFrame.restore();
    });

    it('should handle a frame without context', function() {
      sinon.stub(window, 'extractContextFromFrame').returns(undefined);
      var frame = {
        url: 'http://example.com/path/file.js',
        line: 10,
        column: 11,
        func: 'lol'
        // context: []  context is stubbed
      };

      assert.deepEqual(normalizeFrame(frame), {
        abs_path: 'http://example.com/path/file.js',
        filename: 'file.js',
        lineno: 10,
        colno: 11,
        'function': 'lol',
        in_app: true
      });
      window.extractContextFromFrame.restore();
    });
  });

  describe('extractContextFromFrame', function() {
    it('should handle a normal frame', function() {
      var frame = {
        column: 2,
        context: [
          'line1',
          'line2',
          'line3',
          'line4',
          'line5',
          'culprit',
          'line7',
          'line8',
          'line9',
          'line10',
          'line11'
        ]
      };
      var context = extractContextFromFrame(frame);
      assert.deepEqual(context, [
        ['line1', 'line2', 'line3', 'line4', 'line5'],
        'culprit',
        ['line7', 'line8', 'line9', 'line10', 'line11']
      ]);
    });

    it('should return nothing if there is no context', function() {
      var frame = {
        column: 2
      };
      assert.isUndefined(extractContextFromFrame(frame));
    });

    it('should reject a context if a line is too long without a column', function() {
      var frame = {
        context: [
          new Array(1000).join('f')  // generate a line that is 1000 chars long
        ]
      };
      assert.isUndefined(extractContextFromFrame(frame));
    });

    it('should reject a minified context with sourceMaps enabled', function() {
      var frame = {
        column: 2,
        context: [
          new Array(1000).join('f')
        ]
      };
      globalOptions.sourceMaps = true;
      assert.isUndefined(extractContextFromFrame(frame));
    });

    it('should truncate the minified line if there is a column number without sourcemaps enabled', function() {
      // Note to future self:
      // Array(51).join('f').length === 50
      var frame = {
        column: 2,
        context: [
          'aa' + (new Array(51).join('f')) + (new Array(500).join('z'))
        ]
      };
      assert.deepEqual(extractContextFromFrame(frame), [[], new Array(51).join('f'), []]);
    });
  });

  describe('processException', function() {
    it('should respect `ignoreErrors`', function() {
      sinon.stub(window, 'send');

      globalOptions.ignoreErrors = ['e1', 'e2'];
      processException('Error', 'e1', 'http://example.com', []);
      assert.isFalse(window.send.called);
      processException('Error', 'e2', 'http://example.com', []);
      assert.isFalse(window.send.called);
      processException('Error', 'error', 'http://example.com', []);
      assert.isTrue(window.send.calledOnce);

      window.send.restore();
    });

    it('should respect `ignoreUrls`', function() {
      sinon.stub(window, 'send');

      globalOptions.ignoreUrls = [/.+?host1.+/, /.+?host2.+/];
      processException('Error', 'error', 'http://host1/', []);
      assert.isFalse(window.send.called);
      processException('Error', 'error', 'http://host2/', []);
      assert.isFalse(window.send.called);
      processException('Error', 'error', 'http://host3/', []);
      assert.isTrue(window.send.calledOnce);

      window.send.restore();
    });

    it('should send a proper payload with frames', function() {
      sinon.stub(window, 'send');

      var frames = [
        {
          filename: 'http://example.com/file1.js'
        },
        {
          filename: 'http://example.com/file2.js'
        }
      ];

      processException('Error', 'lol', 'http://example.com/override.js', 10, frames, {});
      assert.deepEqual(window.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: frames
        },
        culprit: 'http://example.com/override.js',
        message: 'lol at 10'
      }]);

      processException('Error', 'lol', '', 10, frames, {});
      assert.deepEqual(window.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: frames
        },
        culprit: 'http://example.com/file1.js',
        message: 'lol at 10'
      }]);

      processException('Error', 'lol', '', 10, frames, {extra: 'awesome'});
      assert.deepEqual(window.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: frames
        },
        culprit: 'http://example.com/file1.js',
        message: 'lol at 10',
        extra: 'awesome'
      }]);

      window.send.restore();
    });

    it('should send a proper payload without frames', function() {
      sinon.stub(window, 'send');

      processException('Error', 'lol', 'http://example.com/override.js', 10, [], {});
      assert.deepEqual(window.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: [{
            filename: 'http://example.com/override.js',
            lineno: 10
          }]
        },
        culprit: 'http://example.com/override.js',
        message: 'lol at 10'
      }]);

      processException('Error', 'lol', 'http://example.com/override.js', 10, [], {});
      assert.deepEqual(window.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: [{
            filename: 'http://example.com/override.js',
            lineno: 10
          }]
        },
        culprit: 'http://example.com/override.js',
        message: 'lol at 10'
      }]);

      processException('Error', 'lol', 'http://example.com/override.js', 10, [], {extra: 'awesome'});
      assert.deepEqual(window.send.lastCall.args, [{
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'lol'
        },
        'sentry.interfaces.Stacktrace': {
          frames: [{
            filename: 'http://example.com/override.js',
            lineno: 10
          }]
        },
        culprit: 'http://example.com/override.js',
        message: 'lol at 10',
        extra: 'awesome'
      }]);

      window.send.restore();
    });
  });

  describe('send', function() {
    it('should check `isSetup`', function() {
      sinon.stub(window, 'isSetup').returns(false);
      sinon.stub(window, 'makeRequest');

      send();
      assert.isTrue(window.isSetup.calledOnce);
      assert.isFalse(window.makeRequest.calledOnce);

      window.isSetup.restore();
      window.makeRequest.restore();
    });

    it('should build a good data payload', function() {
      sinon.stub(window, 'isSetup').returns(true);
      sinon.stub(window, 'makeRequest');

      globalProject = 2;
      globalOptions = {
        logger: 'javascript',
        site: 'THE BEST'
      };

      send({foo: 'bar'});
      assert.deepEqual(window.makeRequest.lastCall.args, [{
        project: 2,
        logger: 'javascript',
        site: 'THE BEST',
        platform: 'javascript',
        'sentry.interfaces.Http': {
          url: window.location.protocol + '//' + window.location.host + window.location.pathname,
          querystring: window.location.search.slice(1),
          headers: {
            'User-Agent': navigator.userAgent
          }
        },
        foo: 'bar'
      }]);

      window.isSetup.restore();
      window.makeRequest.restore();
    });

    it('should build a good data payload with a User', function() {
      sinon.stub(window, 'isSetup').returns(true);
      sinon.stub(window, 'makeRequest');

      globalProject = 2;
      globalOptions = {
        logger: 'javascript',
        site: 'THE BEST'
      };

      globalUser = {name: 'Matt'};

      send({foo: 'bar'});
      assert.deepEqual(window.makeRequest.lastCall.args, [{
        project: 2,
        logger: 'javascript',
        site: 'THE BEST',
        platform: 'javascript',
        'sentry.interfaces.Http': {
          url: window.location.protocol + '//' + window.location.host + window.location.pathname,
          querystring: window.location.search.slice(1),
          headers: {
            'User-Agent': navigator.userAgent
          }
        },
        'sentry.interfaces.User': {
          name: 'Matt'
        },
        foo: 'bar'
      }]);

      window.isSetup.restore();
      window.makeRequest.restore();
    });

    it('should let dataCallback override everything', function() {
      sinon.stub(window, 'isSetup').returns(true);
      sinon.stub(window, 'makeRequest');

      globalOptions = {
        projectId: 2,
        logger: 'javascript',
        site: 'THE BEST',
        dataCallback: function() {
          return {lol: 'ibrokeit'};
        }
      };

      globalUser = {name: 'Matt'};

      send({foo: 'bar'});
      assert.deepEqual(window.makeRequest.lastCall.args, [{
        lol: 'ibrokeit'
      }]);

      window.isSetup.restore();
      window.makeRequest.restore();
    });
  });

  describe('makeRequest', function() {
    it('should load an Image', function() {
      imageCache = [];
      sinon.stub(window, 'getAuthQueryString').returns('?lol');
      globalServer = 'http://localhost/';

      makeRequest({foo: 'bar'});
      assert.equal(imageCache.length, 1);
      assert.equal(imageCache[0].src, 'http://localhost/?lol&sentry_data=%7B%22foo%22%3A%22bar%22%7D');
      window.getAuthQueryString.restore();
    });
  });

  describe('handleStackInfo', function() {
    it('should work as advertised', function() {
      sinon.stub(window, 'normalizeFrame').returns('frame');
      sinon.stub(window, 'processException');

      var stackInfo = {
        name: 'Matt',
        message: 'hey',
        url: 'http://example.com',
        lineno: 10,
        stack: new Array(2)
      };

      handleStackInfo(stackInfo, {foo: 'bar'});
      assert.deepEqual(window.processException.lastCall.args, [
        'Matt', 'hey', 'http://example.com', 10, ['frame', 'frame'], {foo: 'bar'}
      ]);
      window.normalizeFrame.restore();
      window.processException.restore();
    });

    it('should work as advertised #integration', function() {
      sinon.stub(window, 'makeRequest');
      setupRaven();
      var stackInfo = {
        name: 'Error',
        message: 'crap',
        url: 'http://example.com',
        lineno: 10,
        stack: [
          {
            url: 'http://example.com/file1.js',
            line: 10,
            column: 11,
            func: 'broken',
            context: [
              'line1',
              'line2',
              'line3'
            ]
          },
          {
            url: 'http://example.com/file2.js',
            line: 12,
            column: 13,
            func: 'lol',
            context: [
              'line4',
              'line5',
              'line6'
            ]
          }
        ]
      };

      handleStackInfo(stackInfo, {foo: 'bar'});
      assert.isTrue(window.makeRequest.calledOnce);
      /* This is commented out because chai is broken.

      assert.deepEqual(window.makeRequest.lastCall.args, [{
        project: 2,
        logger: 'javascript',
        platform: 'javascript',
        'sentry.interfaces.Http': {
          url: window.location.protocol + '//' + window.location.host + window.location.pathname,
          querystring: window.location.search.slice(1)
        },
        'sentry.interfaces.Exception': {
          type: 'Error',
          value: 'crap'
        },
        'sentry.interfaces.Stacktrace': {
          frames: [{
            abs_path: 'http://example.com/file1.js',
            filename: 'file1.js',
            lineno: 10,
            colno: 11,
            'function': 'broken',
            post_context: ['line3'],
            context_line: 'line2',
            pre_context: ['line1']
          }, {
            abs_path: 'http://example.com/file2.js',
            filename: 'file2.js',
            lineno: 12,
            colno: 13,
            'function': 'lol',
            post_context: ['line6'],
            context_line: 'line5',
            pre_context: ['line4']
          }]
        },
        culprit: 'http://example.com',
        message: 'crap at 10',
        foo: 'bar'
      }]);
      */
      window.makeRequest.restore();
    });
  });
});

describe('Raven (public API)', function() {
  afterEach(function() {
    flushRavenState();
  });

  describe('.VERSION', function() {
    it('should have a version', function() {
      assert.isString(Raven.VERSION);
    });
  });

  describe('.config', function() {
    it('should work with a DSN', function() {
      assert.equal(Raven, Raven.config(SENTRY_DSN, {foo: 'bar'}), 'it should return Raven');
      assert.equal(globalKey, 'abc');
      assert.equal(globalServer, 'http://example.com:80/api/2/store/');
      assert.deepEqual(globalOptions.ignoreErrors, ['Script error.'], 'it should install "Script error." by default');
      assert.equal(globalOptions.foo, 'bar');
      assert.equal(globalProject, 2);
    });
  });

  describe('.install', function() {
    it('should check `isSetup`', function() {
      sinon.stub(window, 'isSetup').returns(false);
      sinon.stub(TraceKit.report, 'subscribe');
      Raven.install();
      assert.isTrue(window.isSetup.calledOnce);
      assert.isFalse(TraceKit.report.subscribe.calledOnce);
      window.isSetup.restore();
      TraceKit.report.subscribe.restore();
    });

    it('should register itself with TraceKit', function() {
      sinon.stub(window, 'isSetup').returns(true);
      sinon.stub(TraceKit.report, 'subscribe');
      assert.equal(Raven, Raven.install());
      assert.isTrue(TraceKit.report.subscribe.calledOnce);
      assert.equal(TraceKit.report.subscribe.lastCall.args[0], handleStackInfo);
      window.isSetup.restore();
      TraceKit.report.subscribe.restore();
    });
  });

  describe('.wrap', function() {
    it('should return a wrapped callback', function() {
      var spy = sinon.spy();
      var wrapped = Raven.wrap(spy);
      assert.isFunction(wrapped);
      wrapped();
      assert.isTrue(spy.calledOnce);
    });
  });

  describe('.context', function() {
    it('should execute the callback with options', function() {
      var spy = sinon.spy();
      sinon.stub(Raven, 'captureException');
      Raven.context({'foo': 'bar'}, spy);
      assert.isTrue(spy.calledOnce);
      assert.isFalse(Raven.captureException.called);
      Raven.captureException.restore();
    });

    it('should execute the callback with arguments', function() {
      var spy = sinon.spy();
      var args = [1, 2];
      Raven.context(spy, args);
      assert.deepEqual(spy.lastCall.args, args);
    });

    it('should execute the callback without options', function() {
      var spy = sinon.spy();
      sinon.stub(Raven, 'captureException');
      Raven.context(spy);
      assert.isTrue(spy.calledOnce);
      assert.isFalse(Raven.captureException.called);
      Raven.captureException.restore();
    });

    it('should capture the exception with options', function() {
      var error = new Error('crap');
      var broken = function() { throw error; };
      sinon.stub(Raven, 'captureException');
      Raven.context({'foo': 'bar'}, broken);
      assert.isTrue(Raven.captureException.called);
      assert.deepEqual(Raven.captureException.lastCall.args, [error, {'foo': 'bar'}]);
      Raven.captureException.restore();
    });

    it('should capture the exception without options', function() {
      var error = new Error('crap');
      var broken = function() { throw error; };
      sinon.stub(Raven, 'captureException');
      Raven.context(broken);
      assert.isTrue(Raven.captureException.called);
      assert.deepEqual(Raven.captureException.lastCall.args, [error, undefined]);
      Raven.captureException.restore();
    });
  });

  describe('.uninstall', function() {
    it('should unsubscribe from TraceKit', function() {
      sinon.stub(TraceKit.report, 'unsubscribe');
      Raven.uninstall();
      assert.isTrue(TraceKit.report.unsubscribe.calledOnce);
      assert.equal(TraceKit.report.unsubscribe.lastCall.args[0], handleStackInfo);
      TraceKit.report.unsubscribe.restore();
    });
  });

  describe('.setUser', function() {
    it('should set the globalUser object', function() {
      Raven.setUser({name: 'Matt'});
      assert.deepEqual(globalUser, {name: 'Matt'});
    });

    it('should clear the globalUser with no arguments', function() {
      globalUser = {name: 'Matt'};
      Raven.setUser();
      assert.isUndefined(globalUser);
    });
  });

  describe('.captureMessage', function() {
    it('should work as advertised', function() {
      sinon.stub(window, 'send');
      Raven.captureMessage('lol', {foo: 'bar'});
      assert.deepEqual(window.send.lastCall.args, [{
        message: 'lol',
        foo: 'bar'
      }]);
      window.send.restore();
    });

    it('should work as advertised #integration', function() {
      imageCache = [];
      setupRaven();
      Raven.captureMessage('lol', {foo: 'bar'});
      assert.equal(imageCache.length, 1);
      // It'd be hard to assert the actual payload being sent
      // since it includes the generated url, which is going to
      // vary between users running the tests
      // Unit tests should cover that the payload was constructed properly
    });
  });

  describe('.captureException', function() {
    it('should call TraceKit.report', function() {
      var error = new Error('crap');
      sinon.stub(TraceKit, 'report');
      Raven.captureException(error, {foo: 'bar'});
      assert.isTrue(TraceKit.report.calledOnce);
      assert.deepEqual(TraceKit.report.lastCall.args, [error, {foo: 'bar'}]);
      TraceKit.report.restore();
    });

    it('shouldn\'t reraise the if the error is the same error', function() {
      var error = new Error('crap');
      sinon.stub(TraceKit, 'report').throws(error);
      // this would raise if the errors didn't match
      Raven.captureException(error, {foo: 'bar'});
      assert.isTrue(TraceKit.report.calledOnce);
      TraceKit.report.restore();
    });

    it('should reraise a different error', function(done) {
      var error = new Error('crap1');
      sinon.stub(TraceKit, 'report').throws(error);
      try {
        Raven.captureException(new Error('crap2'));
      } catch(e) {
        assert.equal(e, error);
        done();
      }
      TraceKit.report.restore();
    });
  });
});
