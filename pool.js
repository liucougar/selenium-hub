var sys=require("sys"), http=require("http"), config=require("config");

var SessionManager=function(pool){
	this._sessions={};
	this._pool=pool;
}
SessionManager.prototype={
	get: function(id){
		return this._sessions[id];
	},
	add: function(id,rc,lock,cleanupfunc){
		this._sessions[id]={id:id,rc:rc,lock:lock,lastChecked:+new Date,cleanup:cleanupfunc};
		if(this._pool && !this._heartBeat){
			var self=this;
			this._heartBeat=setInterval(function(){self.heartBeat()},config.global.get('sessionHearbeat'));
		}
	},
	set: function(session,f,v){
		var s=session;
		if(typeof s=='string'){
			s=this.get(session);
		}
		if(s){
			s[f]=v;
		}else{
			sys.log('cant find session '+session);
		}
	},
	heartBeat: function(){
		var cutoff=+new Date-config.global.get('sessionTimeout');
		for(var id in this._sessions){
			if(this._sessions[id].lastChecked<cutoff){
                sys.puts('session timeout, closing '+(new Date)+' '+new Date(this._sessions[id].lastChecked));
				this._pool.closeSession(id);
				//this.remove(id);
			}
		}
	},
	remove: function(id){
		var s=this._sessions[id];
		delete this._sessions[id];
        if(this._pool){
            var empty=!Object.keys(this._sessions).length;
            if(empty && this._heartBeat){
                clearInterval(this._heartBeat);
                this._heartBeat=null;
            }
        }
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
    this.pending=new SessionManager();
    this.schedular=new RCScheduleQueue();
	this._map={};
	this._locks={};
    this._pendinglocks={};
}
exports.PoolManager=PoolManager;

PoolManager.prototype={
	load: function(){
		var ls=config.global.get("remote-controls");
		ls.forEach(function(r){
			this.add(r);
		},this);
		//this.add({os:'win_xp',host:'192.168.1.61',port:4444,browsers:['*firefox','*iexplore']});
		//this.add({os:'win_xp',host:'192.168.28.129',port:4444,browsers:['*firefox','*iexplore']});
	},
	_getKey: function(obj){
		return obj.host+':'+obj.port;
	},
	_match: function(k, obj){
		var ps=k.split('@');
		if(ps.length==1 || obj.os=='*' || obj.os.substr(0,ps[1].length)==ps[1]){
			var i=0,b, targetb=ps[0];
			while((b=obj.browsers[i++])){
				if(targetb.length<b.length?
				  b.substr(0,targetb.length)==targetb :
				  b==targetb.substr(0,b.length)){
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
			if(t-rc._lastCheckTime>config.global.get('retryDisconnectedRC')){
				this.markAs(rc,1);
				return true;
			}
			return false;
		}
	},
	_isLocked: function(lock,rc){
        var k=rc.rc_key;
        //lock "focus" is special: if a session already holds a focus lock,
        //no sessions will be created in that RC until the session terminates
        if((this._locks[k] && this._locks[k].indexOf("focus")>=0) ||
          (this._pendinglocks[k] && this._pendinglocks[k].indexOf("focus")>=0)){
            return true;
        }
        if(!lock || 
           ( (!this._locks[k] || this._locks[k].indexOf(lock)<0) &&
           (!this._pendinglocks[k] || this._pendinglocks[k].indexOf(lock)<0)) ){
            return false;
        }
        return true;
    },
	getRC: function(browserkey, lock){
		var found, rc;
		for(var k in this._map){
			rc=this._map[k];
			if(this._match(browserkey, rc) && !this._isLocked(lock,rc) ){
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
//  clear: function(rc, lock){
//         var k=rc.rc_key;
//         if(lock){
//             var la=this._pendinglocks[k], i=la.indexOf(lock);
//             if(i<0){
//                 sys.log("ERROR: no pending lock is found for lock "+lock);
//                 return;
//             }
//             la.splice(i,1);
//         }
//     },
	add: function(obj,old){
		var key=this._getKey(obj);
		if(this._map[key]){
			sys.puts('RC is already registered, removing the old one');
			this.remove(obj.rc_key);
		}
		this._map[key]=obj;
		obj.rc_key=key;
		this.markAs(obj,1);
        this.schedular.run();
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
		}else{
			rc._state=1;
			delete rc._retry;
		}
		rc._lastCheckTime=+new Date;
	},
	//SESSION related
	addSession: function(id,rc_key,lock,cleanupfunc){
		if(!this._map[rc_key]){
			throw Error('PoolManager::addSession: RC '+rc_key+" is not registered");
		}
		this.sessions.add(id,this._map[rc_key],lock,cleanupfunc);
		if(lock){
			var la=this._locks[rc_key];
			if(!la){
				this._locks[rc_key]=la=[];
			}
			la.push(lock);
		}
	},
	pendingID: -1,
	//signature is different from addSession: addPending lacks id argument, instead this will return a fake id
    addPending: function(rc_key,lock,cleanupfunc){
        if(!this._map[rc_key]){
            throw Error('PoolManager::addPending: RC '+rc_key+" is not registered");
        }
        var assignedid=this.pendingID--;
        this.pending.add(assignedid,this._map[rc_key],lock,cleanupfunc);
        if(lock){
            var la=this._pendinglocks[rc_key];
            if(!la){
                this._pendinglocks[rc_key]=la=[];
            }
            la.push(lock);
        }
        return assignedid;
    },
	getSession: function(session_id){
		return this.sessions.get(session_id);
	},
	removeSession: function(session_id){
		sys.log('removeSession: '+session_id);
		var s=this.sessions.remove(session_id);
		if(s){
			if(s.lock){
                var la=this._locks[s.rc.rc_key];
				if(la){
					var i=la.indexOf(s.lock);
					if(i>=0){
						la.splice(i,1);
					}
				}
			}
		}
		this.schedular.run();
		return s;
	},
	removePending: function(session_id){
        sys.log('removePending: '+session_id);
        var s=this.pending.remove(session_id);
        if(s){
            if(s.lock){
                var la=this._pendinglocks[s.rc.rc_key];
                if(la){
                    var i=la.indexOf(s.lock);
                    if(i>=0){
                        la.splice(i,1);
                    }
                }
            }
        }
        return s;
    },
	closeSession: function(session_id){
		var session=this.getSession(session_id);
		if(!session){
			return;
		}
		if(session.cleanup){
			session.cleanup();
		}

		this.removeSession(session_id);
	}
}

var RCScheduleQueue=function(){
    this._queue=[];
}
RCScheduleQueue.prototype={
    add: function(/*Function*/o){
        this._queue.push(o);
    },
    run: function(){
        var i=0,it, q=this._queue;
        this._queue=[];
        while((it=q[i++])){
            try{
                it();
            }catch(e){
                sys.log("RCScheduleQueue::run: ERROR "+e.message);
            }
        }
    }
}