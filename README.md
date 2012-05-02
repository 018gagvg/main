# Raven.js

This is an experimental JavaScript client for the [Sentry][1] realtime event
logging and aggregation platform.

The full and minified distribution files include code from two other
open-source projects:

* base64_encode from [php.js][2] (included in the minified distribution)
* crypto-sha1-hmac from [Crypto-JS][3] (included in minified distribution)
* parseUri from [parseUri][5] (included in minified distribution)

The stacktrace generation was inspired by the [javascript-stacktrace][4]
project, and includes heavily modified portions of that project's code.

[1]: http://getsentry.com/
[2]: http://phpjs.org/
[3]: http://code.google.com/p/crypto-js/
[4]: https://github.com/eriwen/javascript-stacktrace
[5]: http://blog.stevenlevithan.com/archives/parseuri


## Install

Download the latest version [here][5].

Raven.js requires either [jQuery][6] (>1.5) or [Zepto.js][7].

First include jQuery or Zepto in your document's head. Then include the
minified distribution file from the 'dist' directory:

    <script type="text/javascript" src="js/jquery.js"></script>
    <script type="text/javascript" src="js/raven-0.2.1.min.js"></script>

[5]: https://github.com/downloads/lincolnloop/raven-js/raven-js-0.2.1.tar.gz
[6]: http://jquery.com/
[7]: http://zeptojs.com/


## Configuration

Configure the client by passing the DSN as the first argument:

    Raven.config('http://secret:public@example.com/project-id');

Or if you need to specify additional options:

    Raven.config({
        "secretKey": "77ec8c99a8854256aa68ccb91dd9119d",
        "publicKey": "e89652ec30b94d9db6ea6f28580ab499",
        "servers": ["http://your.sentryserver.com/api/store/"],
        "projectId": "project-id",
        "logger": "yoursite.errors.javascript"
    });

**secretKey** - If you're using project auth, this should be the desired user's
secret key. Otherwise, this should be the global superuser key. If you are
using the `signatureUrl` option below, then you should omit this from your
config.

**publicKey** - This is only needed if you're using project auth, and it should
be the desired user's public key.

**servers** - (*required*) An array of servers to send exception info to.

**projectId** - The id of the project to log the exception to. Defaults to '1'.

**logger** - The logger name you wish to send with the message. Defaults to
'javascript'.

**site** - An optional site name to include with the message.

**fetchHeaders** - Generate a HEAD request to gather header information to send
with the message. This defaults to 'false' because it doesn't work on
cross-domain requests.

**signatureUrl** - Use a server side url to get a signature for the message.
See below in the "Security" section for more details.


## Logging Errors

You can manually log errors like this:

    try {
        errorThrowingCode();
    } catch(err) {
        Raven.captureException(err);
        // Handle error...
    }

On browsers that support it, you can attach the `Raven.process` method directly
to the `window.onerror` attribute:

    window.onerror = Raven.process;

This should be harmless on browsers that don't support window.onerror, and in
those cases it will simply do nothing.

## Security

The `Raven.config` method above is insecure because it reveals the secretKey.

### Server-side Signing

One way to work around this is to send the message to the server for signing.
Use the `signatureUrl` configuration option to provide a url to use to obtain a
signature. Raven.js will send a POST request to the url containing a "message",
with the base64 encoded message, and a "timestamp". The server-side code should
then use the secret key to sign the request using a SHA1-signed HMAC.

To generate the HMAC signature, take the following example (in Python):

    hmac.new(SENTRY_KEY, '%s %s' % (timestamp, message), hashlib.sha1).hexdigest()

The response should be a JSON string containing a "signature" key with the
generated signature:

    {"signature": "4799ab65ff3052aa8768987d918014c6d40f75d0"}

### Simple Obfuscation

If you would just like to obfuscate this somewhat, you can pass the options to
the `config` method as a base64 encoded JSON string:

    Raven.config("eyJzZWNyZXRLZXkiOiAiNzdlYzhjOTlhODg1NDI1NmFhNjhjY2I5MWRkOTExOWQiLCAicHVibGljS2V5IjogImU4OTY1MmVjMzBiOTRkOWRiNmVhNmYyODU4MGFiNDk5IiwgInNlcnZlcnMiOiBbImh0dHA6Ly95b3VyLnNlbnRyeXNlcnZlci5jb20vYXBpL3N0b3JlLyJdLCAicHJvamVjdElkIjogMSwgImxvZ2dlciI6ICJ5b3Vyc2l0ZS5lcnJvcnMuamF2YXNjcmlwdCJ9");

This is still insecure, but it is less obvious than calling it with plain text
options.

More security options will be forthcoming.

## Support

 * [Bug Tracker](https://github.com/lincolnloop/raven-js/issues)
 * [IRC](irc://chat.freenode.net/sentry) (chat.freenode.net, #sentry)
