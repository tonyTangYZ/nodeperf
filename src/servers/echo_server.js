try {
    var http = require('http');
    var config = {};
    var logger;
    var responseChunk;
    var numResponses = 0;

    (function readConfig() {
        var data = require('fs').readFileSync(__dirname + '/echo_server.json');

        config = JSON.parse(data.toString());

        logger = require('./logger.js').getLogger('EchoServer', config.loglevel || 'INFO');

        config.port = config.port || 8080;

        config.bodySizeBytes = config.bodySizeBytes || 4096;

        responseChunk = new Buffer(config.bodySizeBytes);

        for ( var i = 0; i < config.bodySizeBytes; ++i) {
            if (0 == (i % 20)) {
                responseChunk[i] = 10; // \n
                continue;
            }

            responseChunk[i] = 97; // a
        }
    })();

    if (logger.isInfoEnabled()) {
        logger.info('Starting server');
    }
    
    var exitFunction = function() {
        if (logger.isInfoEnabled()) {
            logger.info('Served ', numResponses, ' requests.');
        }
        
        process.exit(0);
    };
    
    process.on('SIGTERM', exitFunction);
    process.on('SIGINT', exitFunction);

    var workSimulator = require('./work_simulator.js').createWorkSimulator(logger, config);
    
    var server = http.createServer(function(request, response) {
        var requestLine;
        var responseChunkNumber = 0;

        try {
            if (logger.isTraceEnabled()) {
                logger.trace("Accepted new connection from", request.connection.remoteAddress);
            }

            requestLine = request.method + ' ' + request.url + ' HTTP/' + request.httpVersion;

            if (logger.isTraceEnabled()) {
                logger.trace("RECV_IN:", requestLine);

                for ( var fieldName in request.headers) {
                    if (request.headers.hasOwnProperty(fieldName)) {
                        logger.trace("RECV_IN:", fieldName, ':', request.headers[fieldName]);
                    }
                }
            } else if (logger.isDebugEnabled()) {
                logger.debug("RECV_IN:", requestLine);
            }

            // TODO - allocate objects and do computation according to config
            // file

            request.addListener('data', function(chunk) {
                if (logger.isTraceEnabled()) {
                    logger.trace('Recv chunk of size:', chunk.length);
                }
            });

            request.addListener('end', function() {
                workSimulator.processTick();
                
                if (logger.isTraceEnabled()) {
                    logger.trace('Finished request body');
                }

                response.writeHead(200, {
                    'content-type' : 'text/plain; charset=utf-8'
                });

                if (logger.isTraceEnabled()) {
                    logger.trace('Response headers sent');
                }

                if (responseChunkNumber >= config.numResponseChunks) {
                    ++numResponses;

                    if (logger.isTraceEnabled()) {
                        logger.trace('Sent response', numResponses, ', sent 0 chunks');
                    }

                    response.end();
                    return;
                }

                ++responseChunkNumber;

                if (responseChunkNumber >= config.numResponseChunks) {
                    ++numResponses;

                    if (logger.isTraceEnabled()) {
                        logger.trace('Sent response', numResponses, ', sent 1 chunk');
                    }

                    response.end(responseChunk);
                    return;
                }

                response.write(responseChunk);

                var timeoutFunction = function() {
                    ++responseChunkNumber;

                    if (responseChunkNumber >= config.numResponseChunks) {
                        ++numResponses;

                        if (logger.isTraceEnabled()) {
                            logger.trace('Sent response', numResponses, ', sent ', responseChunkNumber, ' chunks');
                        }

                        response.end(responseChunk);

                        return;
                    }

                    response.write(responseChunk);

                    setTimeout(timeoutFunction, config.delayBetweenResponseChunksMillis);
                };

                setTimeout(timeoutFunction, config.delayBetweenResponseChunksMillis);
            });

        } catch (error) {
            var body = {
                'message' : error.toString()
            };

            if (error.stack) {
                body.stack = error.stack;
            }

            response.writeHead(500, {
                'Content-Type' : 'application/json; charset=utf-8'
            });
            response.end(JSON.stringify(body))
        }
    }).listen(config.port);

    if (logger.isInfoEnabled()) {
        logger.info('Listening on port:', config.port);
    }

} catch (error) {
    if (logger) {
        logger.fatal("Cannot start:", error);
    } else {
        console.log("Start failed: " + error.stack || error.toString());
    }

    process.exit(1);
}
