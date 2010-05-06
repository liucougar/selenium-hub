var sys=require("sys"), http=require("http");

var SessionManager=function(pool){
	this._sessions={};
	this._pool=pool;
}
SessionManager.prototype={
	get: function(id){
		return this._sessions[id];
	},
	add: function(id,rc,lock){
		this._sessions[id]={rc:rc,lock:lock};
	},
	remove: function(id){
		var s=this._sessions[id];
		delete this._sessions[id];
		return s;
	},
	_clear: function(rc_key){
		for(var id in this._sessions){
			if(this._sessions[id].rc_key==rc_key){
				this.remove(id);
			}
		}
	}
}

var PoolManager=function(){
	this.sessions=new SessionManager(this);
	this._map={};
	this._locks={};
}
exports.PoolManager=PoolManager;

PoolManager.prototype={
	load: function(){
		this.add({os:'win_xp',host:'192.168.1.61',port:4444,browsers:['*firefox','*iexplore']});
	},
	_getKey: function(obj){
		return obj.host+':'+obj.port;
	},
	_match: function(k, obj){
		var ps=k.split('@');
		if(ps.length==1 || obj.os.substr(0,ps[1].length)==ps[1]){
			var i=0,b, targetb=ps[0];
			while((b=obj.browsers[i++])){
				if(b.substr(0,targetb.length)==targetb){
					return true;
				}
			}
		}
		return false;
	},
	get: function(id){
		return this._map[k];
	},
	_checkRC: function(rc){
		if(rc._state){
			return true;
		}else{
			var t=+new Date;
			if(t-rc._lastCheckTime>5000){
				this.markAs(rc,1);
				return true;
			}
			return false;
		}
	},
	getRC: function(browserkey, lock){
		var found, rc;
		for(var k in this._map){
			rc=this._map[k];
			if(this._match(browserkey, this._map[k]) && (!lock || !this._locks[k] || this._locks[k].indexOf(lock)<0) ){
				if(this._checkRC(rc)){
					found=rc;
					break;
				}
			}
		}
		if(found){
			return found;
		}
		//return this._map[key];
	},
	add: function(obj,old){
		var key=this._getKey(obj);
		if(this._map[key]){
			sys.puts('RC is already registered, removing the old one');
			this.remove(obj.rc_key);
		}
		this._map[key]=obj;
		obj.rc_key=key;
		this.markAs(obj,1);
		//obj._state=1;
	},
	remove: function(rc_key){
		//remove all sessions associated with this RC
		this.sessions._clear();
		//this._map[rc_key].client.end();
		delete this._map[rc_key];
	},
	markAs: function(rc,state){
		if(!state){	//not available
			rc._state=0;
			rc._lastCheckTime=+new Date;
		}else{
			rc._state=1;
			delete rc._retry;
			delete rc._lastCheckTime;
		}
	},
	//SESSION related
	addSession: function(id,rc_key,lock){
		if(!this._map[rc_key]){
			throw Error('RC '+rc_key+" is not registered");
		}
		this.sessions.add(id,this._map[rc_key],lock);
		if(lock){
			var la=this._locks[rc_key];
			if(!la){
				this._locks[rc_key]=la=[];
			}
			la.push(lock);
		}
	},
	getSession: function(session_id){
		return this.sessions.get(session_id);
	},
	removeSession: function(session_id){
		sys.puts('removeSession: '+session_id);
		var s=this.sessions.remove(session_id);
		if(s){
			if(s.lock){
				var la=this._locks[client];
				if(la){
					var i=la.indexOf(s.lock);
					if(i>=0){
						la.splice(i,1);
					}
				}
			}
		}
	},
	closeSession: function(session_id){
		var session=this.getSession(session_id);
		if(!session){
			return;
		}
		var rc=session.rc, client=http.createClient(rc.port,rc.host),
		  request=client.request('GET', "/selenium-server/driver/?cmd=testComplete&sessionId="+reqobj.sessionId);
		request.addListener("response",function(response){
			response.addListener("end",function(){
				client.end();
			});
		});
		request.end();
		this.removeSession(session_id);
	}
}
