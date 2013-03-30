var static = require('node-static'),
    _      = require('underscore'),
    path   = require('path'),
    fs     = require('fs'),
    im     = require('imagemagick'),
    Kraken = require('kraken'),
    http   = require('http'),
    https  = require('https'),
    fs     = require('fs');

var file = new(static.Server)('./public', { cache: 60*60*24*365 });

require('http').createServer(function (req, res) {

  computeUrl(req.url, function(err, data) {
    if (err) return file.serveFile('/not-found.html', 404, {}, req, res);
    req.url = data.url;

    file.serve(req, res, function (err, result) {
      if (err && (err.status === 404)) { // If the file wasn't found

        fs.exists('./public/' + data.base, function(exists) {
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
    if (component.match(/^([0-9]{1,2}|100)$/)) {
      settings.quality = component;
      return;
    }

    // Imagedimensions
    // Should be of one of following formats:
    // - x200         => width: auto,            height: 200px,           crop: none
    // - 200x         => width: 200px,           height: auto,            crop: none
    // - 200x200      => width: 200px,           height: 200px,           crop: yes
    // - x50pct       => width: auto,            height: 50% of original, crop: none
    // - 50pctx       => width: 50% of original, height: auto,            crop: none
    // - 50pctx50pct  => width: 50% of original, height: 50% of original, crop: yes
    if (component.match(/^[0-9]*(pct)?x[0-9]*(pct)?$/)) {
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
  var originalImageUrl = imageUrl;

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

var computeImage = function(data, done) {
  options = {
    srcPath: './public' + data.base,
    dstPath: './public' + data.url,
    format: data.extension
  };

  if (data.width) options.width = data.width.replace('pct', '%');
  if (data.height) options.height = data.height.replace('pct', '%');
  if (data.quality) options.quality = data.quality/100;

  im.identify(options.srcPath, function(err, meta){
    if (err) return done(err);

    // Resize and crop
    if (options.width && options.height) {

      resizeOptions = _(options).clone();

      // 200x400 (0.5) => 100x50 (2)
      if (resizeOptions.width/resizeOptions.height < meta.width/meta.height) {
        delete resizeOptions.width;
      } else {
        delete resizeOptions.height;
      }

      // Resize
      im.resize(resizeOptions, function(err, stdout, stderr){
        if (err || stderr) return done(err);

        // Crop
        options.srcPath = options.dstPath;

        im.crop(options, function(err, stdout, stderr){
          if (err || stderr) return done(err);
          console.log(data.url + ' created');
          compressImage(options.dstPath, done);
        });
      });

    // Only resize
    } else {
      im.resize(options, function(err, stdout, stderr){
        if (err || stderr) return done(err);
        console.log(data.url + ' created');
        compressImage(options.dstPath, done);
      });
    }
  });
};


var compressImage = function(file, callback) {
  var options = require('./config');
  var krakenTypes = ['jpg', 'jpeg', 'png', 'gif'];
  var ext = path.extname(file).replace('.', '').toLowerCase();

  if (_.indexOf(krakenTypes, ext) === -1 || !options.KrakenAPI) return callback(null);

  var kraken = new Kraken(options.KrakenAPI);

  console.log('Uploading ' + file + ' to Kraken.io API...');
  kraken.upload(file, function(status) {
    if (status.success) {
      copyImageFromUrl(status.krakedURL, file, function(err) {
        if (err) return log.error('img', err);
        console.log('Squeezed ' + (Math.round(status.savedBytes / 10) / 100) + 'kB (' + status.savedPercent + ') out of ' + file + ': total size: ' + (Math.round(status.krakedSize / 10) / 100) + 'kb');
        callback();
      });
    } else {
      callback(status.error);
    }
  });
};

// Save an image from the web to the desk
copyImageFromUrl = function(imageUrl, destination, callback) {

  var protocol = http;
  if (imageUrl.toLowerCase().indexOf('https') === 0) {
    protocol = https;
  }

  var file = fs.createWriteStream(destination);
  var request = protocol.get(imageUrl, function(response) {
    response.on('end', callback);
    response.on('error', callback);
    response.pipe(file);
  });
};