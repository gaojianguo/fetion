var crypto = require('crypto');
var xml2js = require('xml2js');
var ejs = require('ejs');
var Session = require('./session');
var List = require('./list');

var wrapTpl = '<xml>' +
  '<Encrypt><![CDATA[<%-encrypt%>]]></Encrypt>' +
  '<MsgSignature><![CDATA[<%-signature%>]]></MsgSignature>' +
  '<TimeStamp><%-timestamp%></TimeStamp>' +
  '<Nonce><![CDATA[<%-nonce%>]]></Nonce>' +
'</xml>';

var encryptWrap = ejs.compile(wrapTpl);


/**
 * 检查签名
 */
var checkSignature = function (query, token) {
  var signature = query.signature;
  var timestamp = query.timestamp;
  var nonce = query.nonce;

  var shasum = crypto.createHash('sha1');
  var arr = [token, timestamp, nonce].sort();
  shasum.update(arr.join(''));

  return shasum.digest('hex') === signature;
};

var load = function (stream, callback) {
  // support content-type 'text/xml' using 'express-xml-bodyparser', which set raw xml string
  // to 'req.rawBody'(while latest body-parser no longer set req.rawBody), see
  // https://github.com/macedigital/express-xml-bodyparser/blob/master/lib/types/xml.js#L79
  if (stream.rawBody) {
    callback(null, stream.rawBody);
    return;
  }

  var buffers = [];
  stream.on('data', function (trunk) {
    buffers.push(trunk);
  });
  stream.on('end', function () {
    callback(null, Buffer.concat(buffers));
  });
  stream.once('error', callback);
};

/*!
 * 从飞信的提交中提取XML文件
 */
var getMessage = function (stream, callback) {
  load(stream, function (err, buf) {
    if (err) {
      return callback(err);
    }
    var xml = buf.toString('utf-8');
    stream.fetion_xml = xml;
    xml2js.parseString(xml, {trim: true}, callback);
  });
};

/*!
 * 将xml2js解析出来的对象转换成直接可访问的对象
 */
var formatMessage = function (result) {
  var message = {};
  if (typeof result === 'object') {
    for (var key in result) {
      if (!(result[key] instanceof Array) || result[key].length === 0) {
        continue;
      }
      if (result[key].length === 1) {
        var val = result[key][0];
        if (typeof val === 'object') {
          message[key] = formatMessage(val);
        } else {
          message[key] = (val || '').trim();
        }
      } else {
        message[key] = [];
        result[key].forEach(function (item) {
          message[key].push(formatMessage(item));
        });
      }
    }
  }
  return message;
};

/*!
 * 响应模版
 */
var tpl = ['<xml>',
    '<ToUserName><![CDATA[<%-toUsername%>]]></ToUserName>',
    '<FromUserName><![CDATA[<%-fromUsername%>]]></FromUserName>',
    '<CreateTime><%=createTime%></CreateTime>',
    '<% if (msgType === "device_event" && (Event === "subscribe_status" || Event === "unsubscribe_status")) { %>',
      '<% if (Event === "subscribe_status" || Event === "unsubscribe_status") { %>',
        '<MsgType><![CDATA[device_status]]></MsgType>',
        '<DeviceStatus><%=DeviceStatus%></DeviceStatus>',
      '<% } else { %>',
        '<MsgType><![CDATA[<%=msgType%>]]></MsgType>',
        '<Event><![CDATA[<%-Event%>]]></Event>',
      '<% } %>',
    '<% } else { %>',
      '<MsgType><![CDATA[<%=msgType%>]]></MsgType>',
    '<% } %>',
  '<% if (msgType === "news") { %>',
    '<ArticleCount><%=content.length%></ArticleCount>',
    '<Articles>',
    '<% content.forEach(function(item){ %>',
      '<item>',
        '<Title><![CDATA[<%-item.title%>]]></Title>',
        '<Description><![CDATA[<%-item.description%>]]></Description>',
        '<PicUrl><![CDATA[<%-item.picUrl || item.picurl || item.pic %>]]></PicUrl>',
        '<Url><![CDATA[<%-item.url%>]]></Url>',
      '</item>',
    '<% }); %>',
    '</Articles>',
  '<% } else if (msgType === "music") { %>',
    '<Music>',
      '<Title><![CDATA[<%-content.title%>]]></Title>',
      '<Description><![CDATA[<%-content.description%>]]></Description>',
      '<MusicUrl><![CDATA[<%-content.musicUrl || content.url %>]]></MusicUrl>',
      '<HQMusicUrl><![CDATA[<%-content.hqMusicUrl || content.hqUrl %>]]></HQMusicUrl>',
      '<% if (content.thumbMediaId) { %> ',
      '<ThumbMediaId><![CDATA[<%-content.thumbMediaId || content.mediaId %>]]></ThumbMediaId>',
      '<% } %>',
    '</Music>',
  '<% } else if (msgType === "voice") { %>',
    '<Voice>',
      '<MediaId><![CDATA[<%-content.mediaId%>]]></MediaId>',
    '</Voice>',
  '<% } else if (msgType === "image") { %>',
    '<Image>',
      '<MediaId><![CDATA[<%-content.mediaId%>]]></MediaId>',
    '</Image>',
  '<% } else if (msgType === "video") { %>',
    '<Video>',
      '<MediaId><![CDATA[<%-content.mediaId%>]]></MediaId>',
      '<Title><![CDATA[<%-content.title%>]]></Title>',
      '<Description><![CDATA[<%-content.description%>]]></Description>',
    '</Video>',
  '<% } else if (msgType === "hardware") { %>',
    '<HardWare>',
      '<MessageView><![CDATA[<%-HardWare.MessageView%>]]></MessageView>',
      '<MessageAction><![CDATA[<%-HardWare.MessageAction%>]]></MessageAction>',
    '</HardWare>',
    '<FuncFlag>0</FuncFlag>',
  '<% } else if (msgType === "device_text" || msgType === "device_event") { %>',
    '<DeviceType><![CDATA[<%-DeviceType%>]]></DeviceType>',
    '<DeviceID><![CDATA[<%-DeviceID%>]]></DeviceID>',
    '<% if (msgType === "device_text") { %>',
      '<Content><![CDATA[<%-content%>]]></Content>',
    '<% } else if ((msgType === "device_event" && Event != "subscribe_status" && Event != "unsubscribe_status")) { %>',
      '<Content><![CDATA[<%-content%>]]></Content>',
      '<Event><![CDATA[<%-Event%>]]></Event>',
    '<% } %>',
      '<SessionID><%=SessionID%></SessionID>',
  '<% } else if (msgType === "transfer_customer_service") { %>',
    '<% if (content && content.kfAccount) { %>',
      '<TransInfo>',
        '<KfAccount><![CDATA[<%-content.kfAccount%>]]></KfAccount>',
      '</TransInfo>',
    '<% } %>',
  '<% } else { %>',
    '<Content><![CDATA[<%-content%>]]></Content>',
  '<% } %>',
  '</xml>'].join('');

/*!
 * 编译过后的模版
 */
var compiled = ejs.compile(tpl);

/*!
 * 将内容回复给飞信的封装方法
 */
var reply = function (content, fromUsername, toUsername, message) {
  console.log("后台处理reply----"+content);
  var info = {};
  var type = 'text';
  info.content = content || '';
  info.createTime = new Date().getTime();
  if (message && (message.MsgType === 'device_text' || message.MsgType === 'device_event')) {
    info.DeviceType = message.DeviceType;
    info.DeviceID = message.DeviceID;
    info.SessionID = isNaN(message.SessionID) ? 0 : message.SessionID;
    info.createTime = Math.floor(info.createTime / 1000);
    if (message['Event'] === 'subscribe_status' || message['Event'] === 'unsubscribe_status') {
      delete info.content;
      info.DeviceStatus = isNaN(content) ? 0 : content;
    } else {
      if (!(content instanceof Buffer)) {
        content = String(content);
      }
      info.content = new Buffer(content).toString('base64');
    }
    type = message.MsgType;
    if (message.MsgType === 'device_event') {
      info['Event'] = message['Event'];
    }
  } else if (Array.isArray(content)) {
    type = 'news';
  } else if (typeof content === 'object') {
    if (content.hasOwnProperty('type')) {
      type = content.type;
      if (content.content) {
        info.content = content.content;
      }
      if (content.HardWare) {
        info.HardWare = content.HardWare;
      }
    } else {
      type = 'music';
    }
  }
  info.msgType = type;
  info.toUsername = toUsername;
  info.fromUsername = fromUsername;
  console.log(compiled(info));
  return compiled(info);
};

var respond = function (handler) {
  return function (req, res, next) {
    var message = req.fetion;
    console.log("deal respond");
    var callback = handler.getHandler(message.MsgType);

    res.reply = function (content) {
      res.writeHead(200);
      // 响应空字符串，用于响应慢的情况，避免飞信重试
      if (!content) {
        return res.end('');
      }

      res.end(reply(content, message.ToUserName, message.FromUserName, message));
    };

    var done = function () {
      // 如果session中有_wait标记
      if (message.MsgType === 'text' && req.wxsession && req.wxsession._wait) {
        var list = List.get(req.wxsession._wait);
        var handle = list.get(message.Content);
        var wrapper = function (message) {
          return handler.handle ? function(req, res) {
            res.reply(message);
          } : function (info, req, res) {
            res.reply(message);
          };
        };

        // 如果回复命中规则，则用预置的方法回复
        if (handle) {
          callback = typeof handle === 'string' ? wrapper(handle) : handle;
        }
      }

      // 兼容旧API
      if (handler.handle) {
        callback(req, res, next);
      } else {
        callback(message, req, res, next);
      }
    };
    console.log(req.sessionStore);
    if (req.sessionStore) {
      var storage = req.sessionStore;
      var _end = res.end;
      var openid = message.FromUserName + ':' + message.ToUserName;
      res.end = function () {
        _end.apply(res, arguments);
        if (req.wxsession) {
          req.wxsession.save();
        }
      };
      // 等待列表
      res.wait = function (name, callback) {
        var list = List.get(name);
        if (list) {
          req.wxsession._wait = name;
          res.reply(list.description);
        } else {
          var err = new Error('Undefined list: ' + name);
          err.name = 'UndefinedListError';
          res.writeHead(500);
          res.end(err.name);
          callback && callback(err);
        }
      };

      // 清除等待列表
      res.nowait = function () {
        delete req.wxsession._wait;
        res.reply.apply(res, arguments);
      };
      console.log("openid="+openid);
      storage.get(openid, function (err, session) {
        console.log(session);
        if (!session) {
          req.wxsession = new Session(openid, req);
          req.wxsession.cookie = req.session.cookie;
        } else {
          req.wxsession = new Session(openid, req, session);
        }
        console.log(req.wxsession);
        done();
      });
    } else {
      done();
    }
  };
};
/**
 * 飞信自动回复平台的内部的Handler对象
 * @param {String|Object} config 配置
 * @param {Function} handle handle对象
 */
var Handler = function (token, handle) {
  if (token) {
    this.setToken(token);
  }
  this.handlers = {};
  this.handle = handle;
};

Handler.prototype.setToken = function (token) {
  if (typeof token === 'string') {
    this.token = token;
  } else {
    this.token = token.token;
    this.appid = token.appid;
    this.encodingAESKey = token.encodingAESKey;
  }
};

/**
 * 设置handler对象
 * 按消息设置handler对象的快捷方式
 *
 * - `text(fn)`
 * - `image(fn)`
 * - `voice(fn)`
 * - `video(fn)`
 * - `location(fn)`
 * - `link(fn)`
 * - `event(fn)`
 * @param {String} type handler处理的消息类型
 * @param {Function} handle handle对象
 */
Handler.prototype.setHandler = function (type, fn) {
  this.handlers[type] = fn;
  return this;
};

['text', 'image', 'voice', 'video', 'location', 'link', 'event', 'shortvideo', 'hardware', 'device_text', 'device_event'].forEach(function (method) {
  Handler.prototype[method] = function (fn) {
    return this.setHandler(method, fn);
  };
});

/**
 * 根据消息类型取出handler对象
 * @param {String} type 消息类型
 */
Handler.prototype.getHandler = function (type) {
  return this.handle || this.handlers[type] || function (info, req, res, next) {
    next();
  };
};


/**
 * 根据Handler对象生成响应方法，并最终生成中间件函数
 */
Handler.prototype.middlewarify = function () {
  var that = this;
  var token = this.token;
  var _respond = respond(this);
  return function (req, res, next) {
    // 如果已经解析过了，调用相关handle处理
    if (req.fetion) {
      _respond(req, res, next);
      return;
    }
    
    var method = req.method;
	// 动态token，在前置中间件中设置该值req.wechat_token，优先选用
	if (!checkSignature(req.query, req.wechat_token || token)) {
		res.writeHead(401);
		res.end('Invalid signature');
		return;
	}
	if (method === 'GET') {
		res.writeHead(200);
    console.log("接入成功");
		res.end(req.query.echostr);
	} else if (method === 'POST') {
		getMessage(req, function(err, result) {
			if (err) {
				err.name = 'BadMessage' + err.name;
				return next(err);
			}
			req.fetion = formatMessage(result.xml);
			_respond(req, res, next);
		});
	} else {
		res.writeHead(501);
		res.end('Not Implemented');
	}
    
  };
};

var middleware = function (token, handle) {
  if (arguments.length === 1) {
    return new Handler(token);
  }

  if (handle instanceof Handler) {
    handle.setToken(token);
    return handle.middlewarify();
  } else {
    return new Handler(token, handle).middlewarify();
  }
};

var middleware = function (token, handle) {
  if (arguments.length === 1) {
    return new Handler(token);
  }

  if (handle instanceof Handler) {
    handle.setToken(token);
    return handle.middlewarify();
  } else {
    return new Handler(token, handle).middlewarify();
  }
};

['text', 'image', 'voice', 'video', 'shortvideo', 'location', 'link', 'event'].forEach(function (method) {
  middleware[method] = function (fn) {
    return (new Handler())[method](fn);
  };
});

middleware.toXML = compiled;
middleware.checkSignature = checkSignature;
middleware.reply = reply;

module.exports = middleware;