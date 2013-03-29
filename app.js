var static = require('node-static'),
    _      = require('underscore'),
    path   = require('path'),
    fs     = require('fs'),
    im     = require('imagemagick');

var file = new(static.Server)('./public', { cache: 60*60*24*365 });

require('http').createServer(function (req, res) {

  computeUrl(req.url, function(err, data) {
    if (err) return file.serveFile('/not-found.html', 404, {}, req, res);
    req.url = data.url;

    file.serve(req, res, function (err, result) {
      if (err && (err.status === 404)) { // If the file wasn't found

        fs.exists(data.base, function(exists) {
          if (exists) {
            computeImage(data, function() {
              file.serve(req, res);
            });
          } else {
            file.serveFile('/not-found.html', 404, {}, req, res);
          }
        });

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
    if (component.match(/^[0-100]$/)) {
      settings.quality = component;
      return;
    }

    // Imagedimensions
    // Should be of one of following formats:
    // - x200     => width: auto,            height: 200px,           crop: none
    // - 200x     => width: 200px,           height: auto,            crop: none
    // - 200x200  => width: 200px,           height: 200px,           crop: yes
    // - x50%     => width: auto,            height: 50% of original, crop: none
    // - 50%x     => width: 50% of original, height: auto,            crop: none
    // - 50%x50%  => width: 50% of original, height: 50% of original, crop: yes
    if (component.match(/^[0-9]*%?x[0-9]*%?$/)) {
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
  var originalImageUrl = './public' + imageUrl;

  if (settings.width || settings.height) {
    imageUrl += '-';
    if (settings.width) imageUrl += settings.width;
    imageUrl += 'x';
    if (settings.height) imageUrl += settings.height;
  }

  if (settings.quality) imageUrl += '-' + settings.quality;

  imageUrl += '.' + settings.extension;
  originalImageUrl += '.' + settings.extension;

  settings.url = imageUrl;
  settings.base = originalImageUrl;
  callback(null, settings);
};

var computeImage = function(data, callback) {
  console.log('Make image');
  callback();
};