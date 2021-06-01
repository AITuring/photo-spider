const fs=require('fs');
const request=require('request');

// 实现代码
const url = 'http://q1.xiongmaoya.com/2021/04/30/24945/1.jpg'
const name = '1'

let imgSrc=[]

for (let i = 1; i <=75;i++) {
    let nvshen = {
        url: `http://q1.xiongmaoya.com/2021/04/30/24945/${i}.jpg`,
        title: `${i}`
    }
    imgSrc.push(nvshen)
}
// const imgSrc=[{ // 图片地址
//     src: 'http://kr.shaodiyejin.com/file/mm/20201014/fy0qyugkkba.jpg',
//     title: '女孩子'
//   },
//  ]
// 实现内容

 imgSrc.map(async item => {
    request(item.src, function (error, response, body) { 
        if (error) { 
       console.log(error); 
       } 
       console.log(body); 
       var data = body;
     }).pipe(
      fs.createWriteStream(`./${item.title}.jpg`)
    );
  })



