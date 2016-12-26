# fetion
飞信公共平台消息接口服务中间件


## Installation

$ npm install fetion

## Use with Connect/Express

```js
var fetion = require('fetion');
var config = {
  token: 'token'
};

app.use(express.query());
app.use('/fetion', fetion(config, function (req, res, next) {
  // 飞信输入信息都在req.fetion上
  var message = req.fetion;
  if (message.FromUserName === 'diaosi') {
    // 回复屌丝(普通回复)
    res.reply('hehe');
  } else if (message.FromUserName === 'text') {
    //你也可以这样回复text类型的信息
    res.reply({
      content: 'text object',
      type: 'text'
    });
  } else if (message.FromUserName === 'hehe') {
    // 回复一段音乐
    res.reply({
      type: "music",
      content: {
        title: "来段音乐吧",
        description: "一无所有",
        musicUrl: "http://mp3.com/xx.mp3",
        hqMusicUrl: "http://mp3.com/xx.mp3",
        thumbMediaId: "thisThumbMediaId"
      }
    });
  } else {
    // 回复高富帅(图文回复)
    res.reply([
      {
        title: '你来我家接我吧',
        description: '这是女神与高富帅之间的对话',
        picurl: 'http://nodeapi.cloudfoundry.com/qrcode.jpg',
        url: 'http://nodeapi.cloudfoundry.com/'
      }
    ]);
  }
}));
```
备注：token在飞信平台的开发者中心申请

### 回复消息
当用户发送消息到微信公众账号，自动回复一条消息。这条消息可以是文本、图片、语音、视频、图文。详见：[官方文档](http://221.176.30.209/op/send3dev/index.php/sendmessage)

#### 回复文本
```js
res.reply('Hello world!');
// 或者
res.reply({type: "text", content: 'Hello world!'});
```
#### 回复图片
```js
res.reply({
  type: "image",
  content: {
    mediaId: 'mediaId'
  }
});
```
#### 回复语音
```js
res.reply({
  type: "voice",
  content: {
    mediaId: 'mediaId'
  }
});
```
#### 回复视频
```js
res.reply({
  type: "video",
  content: {
    title: '来段视频吧',
    description: '女神与高富帅',
    mediaId: 'mediaId'
  }
});
```

#### 回复图文
```js
res.reply([
  {
    title: '你来我家接我吧',
    description: '这是女神与高富帅之间的对话',
    picurl: 'http://nodeapi.cloudfoundry.com/qrcode.jpg',
    url: 'http://nodeapi.cloudfoundry.com/'
  }
]);