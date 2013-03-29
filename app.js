var static = require('node-static'),
    _      = require('underscore'),
    path   = require('path');

var file = new(static.Server)('./public', { cache: 60*60*24*365 });

require('http').createServer(function (req, res) {

  computeUrl(req.url, function(err, data) {
    if (err) return file.serveFile('/not-found.html', 404, {}, req, res);
    req.url = data.url;

    file.serve(req, res, function (err, result) {
      if (err && (err.status === 404)) { // If the file wasn't found
        file.serveFile('/not-found.html', 404, {}, req, res);
      }
    });
  });
}).listen(3000);

console.log("Image API server listening on port 3000");

/* -------------------------------------------- */

var computeUrl = function(url, callback) {

  var settings = {};

  url = url.toLowerCase();

  // Remove hash and attributes
  url = url.split("?")[0].split("#")[0];
  components = url.split('/');
  components.reverse();

  components.forEach(function(component) {

    if (component === '') return;

    // Filepath
    if (settings.folder) {
      settings.folder = component + '-' + settings.folder;
      return;
    }

    // Quality
    if (component.match(/^[0-9]*$/)) {
      settings.quality = component;
      return;
    }

    // Imagedimensions
    if (component.match(/^[0-9]*x[0-9]*$/i)) {
      var dimensions = component.toLowerCase().split('x');
      if (dimensions[0] !== '') settings.width = dimensions[0];
      if (dimensions[1] !== '') settings.height = dimensions[1];
      return;
    }

    // Filename
    if (_(component).contains('.')) {
      var ext = path.extname(component);
      var basename = path.basename(component, ext);
      ext = ext.replace('.', '');
      settings.folder = basename + '_' + ext;
      settings.extension = ext;
      return;
    }

  });

  if (_(settings).isEmpty()) return callback('Invalid url for Image API');

  var imageUrl = '/' + settings.folder + '/img';

  if (settings.width || settings.height) {
    imageUrl += '-';
    if (settings.width) imageUrl += settings.width;
    imageUrl += 'x';
    if (settings.height) imageUrl += settings.height;
  }

  if (settings.quality) imageUrl += '-' + settings.quality;

  imageUrl += '.' + settings.extension;

  settings.url = imageUrl;
  callback(null, settings);
};