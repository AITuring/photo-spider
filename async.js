
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

for (let i = 1; i <=71;i++) {
    let nvshen = {
        url: `http://q1.xiongmaoya.com/2020/08/05/21508/${i}.jpg`,
        title: `dswtfg${i}`
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

