let fs = require('fs')
let request = require('request')
let path = require('path')
// 下载单张图片 src是图片的网上地址 dest是你将这图片放在本地的路径 callback可以是下载之后的事}
const downloadImage = (src, dest, callback) => {
  request.head(src, (err, res, body) => {
    if (err) { console.log(err); return }
    src && request(src).pipe(fs.createWriteStream(dest)).on('close', () => {
      callback && callback(null, dest)
    })
  })
}
downloadImage('http://d.duotuwang.com/2021/04/20/24840/1.jpg', './1.jpg', (err, data) => { err ? console.log(err) : console.log(`下载成功！图片地址是：${path.resolve(data)}`) })

for (let i = 1; i <=5;i++) {
    let url = `http://d.duotuwang.com/2021/04/20/24840/${i}.jpeg`
    downloadImage(url, `/${i}.jpg`, (err, data) => { err ? console.log(err) : console.log(`下载成功！图片地址是：${path.resolve(data)}`) })
}


