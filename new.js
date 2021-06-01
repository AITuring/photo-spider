var http = require('http');
var fs = require('fs');
var path = require('path');

function getImage(url) {
    var imageName = path.parse(url).base;
    var stream = fs.createWriteStream('./' + imageName);
    http.get(url, function(res) {
        res.pipe(stream);
        console.log(imageName + '  download completed！');
    });
}

// let url = 'http://d.duotuwang.com/2021/04/20/24840/1.jpg'
// getImage(url)

for (let i = 1; i <=2;i++) {
    let url = `http://d.duotuwang.com/2021/04/20/24840/${i}.jpeg`
    getImage(url)
}


