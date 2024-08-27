
const async = require("async");
const request = require("request");
const fs = require("fs");
const path = require("path");
const downloadImage = (src, dest, callback) => {
  request.head(src, (err, res, body) => {
    if (err) {
      console.log(err);
      return;
    }
    src &&
      request(src)
        .pipe(fs.createWriteStream(dest))
        .on("close", () => {
          callback && callback(null, dest);
        });
  });
};

let imgSrc=[]

for (let i = 1; i <= 50; i++) {
    let nvshen = {
        url: `http://d.duotuwang.com/2022/11/07/32046/${i}.jpg`,
        title: `dahz${i}`
    }
    imgSrc.push(nvshen)
}


const getSuffix = str => str.slice(str.lastIndexOf("."));
async.mapSeries(imgSrc, function(item, callback) {
  setTimeout(function() {
    var destImage = `${item.title}${getSuffix(item.url)}`;
    destImage = `./pictures/${destImage}`;
    downloadImage(item, destImage, (err, data) => {
      err ? console.log(err) : console.log(path.resolve(data));
    });
    callback && callback(null, item);
  }, 100);
});



