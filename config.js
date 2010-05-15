var fs=require('fs'),sys=require('sys');

var FileConfig=function(file,options){
	options=options||{};
	var content=fs.readFileSync(file);
	this.loaded=content=JSON.parse(content);
	//this.docs={};
	
	for(var i in content){
		if(i.slice(-8)=='.__doc__'){
			//Object.defineProperty(content,i,{value:content[i],enumerable:false,configurable:true});
			//this.docs[i]=content[i];
		}
	}
	this.modified=Object.create(content);
};
exports.FileConfig=FileConfig;
FileConfig.prototype={
	get: function(f){
		return this.modified[f];
	},
	set: function(f,v){
		var obj={};
		if(arguments.length==2){
			obj[f]=v;
		}else{
			obj=f;
		}
		var keys=Object.keys(obj),i=0,k,v;
		while((k=keys[i++])){
			v=obj[k];
			if(!this.loaded.hasOwnProperty(k)){
				//TODO: check the config option is writable
				sys.log('ERROR: unknown configuration option '+k+' with value "'+v+'"');
				continue;
			}
			//JSON.stringify is to make sure we compare list properly
			if(JSON.stringify(v)!=JSON.stringify(this.loaded[k]) && v!==null && v!==undefined){
				this.modified[k]=v;
			}else{
				delete this.modified[k];
			}
		}
	},
	reset: function(){
		var m=this.modified, keys=Object.keys(m);
		keys.forEach(function(v){
			delete m[v];
		});
	}
};