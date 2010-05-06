var http=require("http"), sys=require("sys"),
  proxy=require("./proxy");
http.createServer(function(req,res){
	try{
		if(req.url.substr(0,17)=='/selenium-server/'){
			proxy.passThrough(req,res);
		}else{ //hub request
			sys.puts('hub request '+req.method+" "+req.url);
		}
	}catch(e){sys.puts('error: '+e)}
}).listen(4444);
