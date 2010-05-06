var http=require("http"), sys=require("sys"), parseUrl=require('url').parse,
  parseQuery=require('querystring').parse,
  PoolManager=require("./pool").PoolManager;

var pool=new PoolManager();
pool.load();

exports.passThrough=function (req,res){
	var reqobj={data:"",req:req};
	req.addListener("data", function (chunk) {
		reqobj.data+=chunk;
		//request.write(chunk);
	});
	req.addListener("end", function () {
		_checkClientDriverReq(req,reqobj,res);
		//request.end();
	});
}

function _getArgs(req, data){
	var args;
	if(req.method=='GET'){
		var urlparts=parseUrl(req.url,true);
		args = urlparts.query;
	}else if(req.method=='POST' && data){
		args = parseQuery(data);
	}
	return args;
}

function simpleText(res, code, body) {
	res.sendHeader(code, [ ["Content-Type", "text/plain"]
					   , ["Content-Length", body.length]
					   ]);
	res.write(body);
	res.end();
};

function _checkClientDriverReq(req, reqobj, res){
	var args=_getArgs(req,reqobj && reqobj.data), rc;//=http.createClient(4444,"192.168.1.61");
	sys.puts('_checkClientDriverReq '+args.cmd);
try{
	switch(args.cmd){
		case 'getNewBrowserSession':
			reqobj.args=args;
			reqobj._rclock=args['3'];
			rc=pool.getRC(args['1'],reqobj._rclock);
	
			// sys.puts('getNewBrowserSession '+args['1']+" "+client);
			break;
		case 'testComplete':
			reqobj.args=args;
			//sys.puts('testComplete '+args.sessionId);
			// pass through
		default:
			if(args.sessionId){
				var s=pool.getSession(args.sessionId);
				if(!s){
					sys.puts('TODO: sessionId is unknown');
				}else{
					rc = s.rc;
				}
			}
			break;
	}

	if(!rc){
		sys.puts("ERROR, no selenium-rc available");
		simpleText(res, 404,"ERROR, no selenium-rc available");
		return;
	}
	reqobj.rc=rc;
	var client=http.createClient(rc.port,rc.host);
	//client.setTimeout(5000);
	
	var request=client.request(req.method, req.url, req.headers);
	var timeout=setTimeout(function(){
		//client.emit('timeout');
		var err=new Error('Connection timeout');
		err.errno=110;
		client.emit('error',err);
		client.destroy();
	},1000);
	//client._request=[_checkClientDriverReq,Array.prototype.concat.call([],arguments)];
	client.addListener("connect",function(){
		clearTimeout(timeout);
	});
	client.addListener("error",function(e){
		sys.puts("Can't connect to "+rc.rc_key+" with Error "+e.message+" ("+e.errno+")");
		if(!rc._retry){
			rc._retry=0;
		}
		rc._retry++;
		if(rc._retry>=3){
			sys.puts("Removing RC "+rc.rc_key);
			pool.remove(rc.rc_key);
			reqobj.rc=null;
		}else{
			sys.puts("Try to reconnect (attempt "+rc._retry+")");
			//retry the current request
			//setTimeout(_checkClientDriverReq,500,req, reqobj, res);
		}
		setTimeout(_checkClientDriverReq,500,req, reqobj, res);
	});
	request.addListener("response", function (response) {
		var resdata="";
		response.addListener("data", function (chunk) {
			resdata+=chunk;
		});
		response.addListener("end", function () {
			client._request=null;
			_inspectRCResponse(response,resdata,reqobj,res);
			client.end();
		});
	});
	request.write(reqobj.data);
	request.end();
	}catch(e){sys.puts("error: "+e)};
}

function _parseRCResult(data){
	if(data.substr(0,2)=='OK'){
		if(data.length>2){
			return data.substr(3);
		}
	}else{
		throw Error(data);
	}
}
function _inspectRCResponse(/*resp from RC*/response,/*body of the response data*/resdata,
  /*request obj*/reqobj, /*response to client driver*/res){
	var args=reqobj.args;
	if(args){
		switch(args.cmd){
			case 'getNewBrowserSession':
				try{
					var sId=_parseRCResult(resdata);
					pool.addSession(sId,reqobj.rc.rc_key,reqobj._rclock);
					sys.puts('getNewBrowserSession '+sId);
				}catch(e){
					sys.puts('getNewBrowserSession failed '+e.message);
				}
				break;
			case 'testComplete':
				reqobj.action="complete";
				reqobj.args=args;
				//TODO: do we really care whether the resdata is OK or not?
				sys.puts('testComplete response: '+args.sessionId+" "+resdata);
				pool.removeSession(args.sessionId);
				break;
		}
	}
	res.writeHeader(response.statusCode, response.headers);
	res.write(resdata);
	res.end();
}