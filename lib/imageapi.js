var static = require('node-static'),
    _      = require('underscore'),
    path   = require('path'),
    fs     = require('fs'),
    im     = require('imagemagick'),
    Kraken = require('kraken'),
    http   = require('http'),
    https  = require('https'),
    fs     = require('fs'),
    mkdirp = require('mkdirp');

var file, srcFolder, dstFolder, krakenOptions, port;

module.exports.createServer = function(options) {
  srcFolder     = options.sourceFolder || './public';
  dstFolder     = options.destinationFolder || './images';
  krakenOptions = options.krakenAPI;
  port          = process.env.PORT || options.port || 3000;

  file = new(static.Server)(dstFolder, { cache: 60*60*24*365 });

  http.createServer(function (req, res) {

    computeUrl(req.url, function(err, data) {
      if (err) {
        console.log(err);
        return file.serveFile('/not-found.html', 404, {}, req, res);
      }
      req.url = data.url;

      file.serve(req, res, function (err, result) {
        if (err && (err.status === 404)) { // If the file wasn't found

          fs.exists(srcFolder + data.base, function(exists) {
            if (exists) {
              computeImage(data, function() {
                file.serve(req, res);
              });
            } else {
              console.log(data.base + ' not uploaded');
              file.serveFile('/not-found.html', 404, {}, req, res);
            }
          });

        }
      });
    });
  }).listen(port);
  console.log("Image API server listening on port 3000");
};


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
      settings.folder = component + '/' + settings.folder;
      return;
    }

    // Quality
    if (component.match(/^([1-9][0-9]?|100)$/)) {
      settings.quality = component;
      return;
    }

    // Imagedimensions
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
      settings.folder = basename;
      settings.extension = ext;
      return;
    }

  });

  if (_(settings.folder).isEmpty()) return callback('Invalid url for Image API');

  var imageUrl = '/' + settings.folder;
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
    srcPath: srcFolder + data.base,
    dstPath: dstFolder + data.url,
    format : data.extension
  };

  if (data.width) options.width = data.width.replace('pct', '%');
  if (data.height) options.height = data.height.replace('pct', '%');
  if (!options.width && !options.height) options.width = '100%';
  if (data.quality) options.quality = data.quality/100;

  mkdirp(path.dirname(options.dstPath), function(err) {
    if (err) return done(err);

    // Resize and crop
    if (options.width && options.height) {

      im.identify(options.srcPath, function(err, meta){
        if (err) return done(err);

        resizeOptions = _(options).clone();
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
      });

    // Resize
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
  var krakenTypes = ['jpg', 'jpeg', 'png', 'gif'];
  var krakenLimit = krakenOptions.filesizeLimit || 500;
  var ext = path.extname(file).replace('.', '').toLowerCase();

  if (_.indexOf(krakenTypes, ext) === -1 || !krakenOptions) return callback();

  im.identify(file, function(err, meta){

    // Kraken only accepcts files under 500kb
    if (convertToBytes(meta.filesize) > krakenLimit*1024) return callback();

    var kraken = new Kraken(krakenOptions);

    console.log('Uploading ' + file + ' to Kraken.io API...');
    kraken.upload(file, function(status) {
      if (status.success) {
        copyImageFromUrl(status.krakedURL, file, function(err) {
          if (err) return callback(err);
          console.log('Squeezed ' + (Math.round(status.savedBytes / 10) / 100) + 'kB (' + status.savedPercent + ') out of ' + file + ': total size: ' + (Math.round(status.krakedSize / 10) / 100) + 'kb');
          callback();
        });
      } else {
        callback(status.error);
      }
    });
  });
};

// Save an image from the web to the desk
var copyImageFromUrl = function(imageUrl, destination, callback) {

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

var convertToBytes = function(byteString) {
  byteString = byteString.toLowerCase();
  bytes = parseFloat(byteString);

  var type = byteString.slice(-2);

  if (type === 'kb') {
    bytes *= 1024;
  }
  if (type === 'mb') {
    bytes *= 1024*1024;
  }
  if (type === 'gb') {
    bytes *= 1024*1024*1024;
  }

  return bytes;
};