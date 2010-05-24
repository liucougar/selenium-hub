var http=require("http"), sys=require("sys"), parseUrl=require('url').parse,
  parseQuery=require('querystring').parse,
  config=require("./config"), PoolManager=require("./pool").PoolManager;

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
	if(req.connection.readyState!='open'){
		sys.log('Client driver droped: stop processing request "'+req.url+'" with POST data "'+reqobj.data+'"');
		if(reqobj.sessionId){
			pool.closeSession(reqobj.sessionId);
		}
		return;
	}
	var rc;
	if(reqobj && !reqobj.rc){
		var args=_getArgs(req, reqobj.data);
		sys.log('ClientDriver Request: '+(args.sessionId||'')+' '+args.cmd);

		switch(args.cmd){
			case 'getNewBrowserSession':
				reqobj.args=args;
				reqobj._rclock=args['lock'];
				rc=pool.getRC(args['1'],reqobj._rclock);
				reqobj._noWait=args['noWait'];
				if(rc){
					sys.log("Assign RC "+rc.rc_key);
				}
				// sys.puts('getNewBrowserSession '+args['1']+" "+client);
				break;
			case 'testComplete':
				reqobj.args=args;
				//sys.puts('testComplete '+JSON.stringify(req.headers)+" "+reqobj.data+" "+req.url);
				// pass through
			default:
				if(args.sessionId){
					reqobj.sessionId=args.sessionId;
					var s=pool.getSession(args.sessionId);
					if(!s){
						sys.puts('TODO: sessionId is unknown');
						simpleText(res,200,"ERROR,sessionId is not recognized")
						return;
					}else{
						rc = s.rc;
					}
				}
				break;
		}

		if(!rc){
			sys.puts("ERROR, no selenium-rc available");
			if(reqobj._noWait){
				simpleText(res, 404,"ERROR, no selenium-rc available");
			}else{
				//retry after 1 second
				setTimeout(_checkClientDriverReq,config.global.get("noRCRetryTimeout"),req, reqobj, res);
			}
			return;
		}
		reqobj.rc=rc;
	}else{
		rc=reqobj.rc;
		sys.puts('_checkClientDriverReq retry '+(reqobj.args?reqobj.args.cmd:""));
	}
	var client=http.createClient(rc.port,rc.host);
	//client.setTimeout(5000);
	
	var request=client.request(req.method, req.url, req.headers);
	var timeout=setTimeout(function(){
		//client.emit('timeout');
		var err=new Error('Connection timeout');
		err.errno=110;
		client.emit('error',err);
		client.destroy();
	},config.global.get("connectRCTimeout"));
	//client._request=[_checkClientDriverReq,Array.prototype.concat.call([],arguments)];
	client.addListener("connect",function(){
		clearTimeout(timeout);
	});
	client.addListener("error",function(e){
        //a client may trigger several error events, we only care about the first error
        //because we create a new client each time
        if(!client._errorOccured){
            client._errorOccured=true;
        }else{
            return;
        }
		sys.puts("Can't connect to "+rc.rc_key+" with Error "+e.message+" ("+e.errno+")");
		if(!rc._retry){
			rc._retry=0;
		}
		rc._retry++;
		if(rc._retry>=config.global.get("connectRCErrorRetry")){
			sys.puts("Mark RC "+rc.rc_key+" as unavailable");
			pool.markAs(rc,0);
			//try to find a new one
			reqobj.rc=null;
		}else{
			sys.puts("Try to reconnect (attempt "+rc._retry+")");
			//retry the current request
			//setTimeout(_checkClientDriverReq,500,req, reqobj, res);
		}
		
		setTimeout(_checkClientDriverReq,config.global.get("connectRCErrorRetryInterval"),req, reqobj, res);
	});
	request.addListener("response", function (response) {
		var resdata="";
		response.addListener("data", function (chunk) {
			resdata+=chunk;
		});
		response.addListener("end", function () {
			pool.markAs(rc,1);
			client._request=null;
			_inspectRCResponse(response,resdata,reqobj,res,req);
			client.end();
		});
	});
	request.write(reqobj.data);
	request.end();
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
//this function will be called with this as the session object
function _closeSession(){
	var data="cmd=testComplete&sessionId="+this.id;
	var rc=this.rc, client=http.createClient(rc.port,rc.host),
	  request=client.request('POST', "/selenium-server/driver/",{"host":rc.host+":"+rc.port,"accept-encoding":"identity","content-length":data.length,"content-type":"application/x-www-form-urlencoded; charset=utf-8"});
	request.addListener("response",function(response){
		response.addListener("end",function(){
			client.end();
		});
	});
	//sys.puts('closeSession '+data+" "+data.length);
	request.write(data);
	request.end();
}
function _inspectRCResponse(/*resp from RC*/response,/*body of the response data*/resdata,
  /*request obj*/reqobj, /*response to client driver*/res, /*request from client driver*/req){
	var args=reqobj.args;

	//sometimes, some commands would return lower case ok, let's convert them to upper case OK
	resdata = resdata.replace(/^ok/,'OK')
	
	if(!resdata.length){
		sys.log('Empty response, treat as OK');
		resdata='OK';
	}
	if(args){
		switch(args.cmd){
			case 'getNewBrowserSession':
				try{
					var sId=_parseRCResult(resdata);
					pool.addSession(sId,reqobj.rc.rc_key,reqobj._rclock,_closeSession);
					reqobj.sessionId=sId;
					sys.puts('getNewBrowserSession '+sId);
				}catch(e){
					sys.puts('getNewBrowserSession failed '+e.message);
				}
				break;
			case 'testComplete':
				reqobj.action="complete";
				reqobj.args=args;
				//TODO: do we really care whether the resdata is OK or not?
				pool.removeSession(reqobj.sessionId);
				//no need to do clean up below, we don't have any session now
				delete reqobj.sessionId;
				break;
		}
	}
	if(req.connection.readyState!='open'){
		//the client driver dropped, let's discard any session it was using
		sys.puts('Client driver droped: stop processing request "'+req.url+'" with POST data "'+reqobj.data+'"');
		if(reqobj.sessionId){
			pool.closeSession(reqobj.sessionId);
		}
	}else{
		//update session info
		if(reqobj.sessionId){
			pool.sessions.set(reqobj.sessionId,'lastChecked',+new Date);
		}
		res.writeHead(response.statusCode, response.headers);
		res.write(resdata);
	}
	res.end();
}