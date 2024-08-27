// https://us-img.mmm.red/gallery3/18230/27983964.webp
// https://us-img.mmm.red/gallery3/18230/9cf3d019.webp
// https://us-img.mmm.red/gallery3/18230/195cb302.webp


const request = require("request");
const fs = require("fs");
const path = require("path");

var url = 'https://mmm.red/art/18230#gallery-17'

// 发送Get请求
// 第一个参数:请求的完整URL,包括参数
// 第二个参数:请求结果回调函数,会传入3个参数,第一个错误,第二个响应对象,第三个请求数据
request(url,function (error, response, data) {
    console.log(data)
});