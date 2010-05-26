var http=require("http"), sys=require("sys"),
  config=require("./config");

config.global = new config.FileConfig("./config.json");

//global config object has to be created first before we pull in anything using config options
var proxy=require("./proxy");

http.createServer(function(req,res){
	//try{
		if(req.url.substr(0,17)=='/selenium-server/'){
			proxy.passThrough(req,res);
		}else{ //hub request
			sys.puts('hub request '+req.method+" "+req.url);
		}
	//}catch(e){sys.log('error: '+e)}
}).listen(4444);
