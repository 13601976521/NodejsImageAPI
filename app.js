var static = require('node-static');

var file = new(static.Server)('./public', { cache: 60*60*24*365 });

require('http').createServer(function (request, response) {
  file.serve(request, response, function (err, res) {
    if (err && (err.status === 404)) { // If the file wasn't found
      file.serveFile('/not-found.html', 404, {}, request, response);
    }
  });
}).listen(3000);

console.log("Image API server listening on port 3000");