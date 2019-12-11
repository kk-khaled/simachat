var express = require('express');
var app = express();
var http = require('http');
var server = http.createServer(app);
var io = require('socket.io').listen(server);
const mysql = require('mysql');
const bodyparser = require('body-parser');
const async = require('async');
var multer, storage, path, crypto;
multer = require('multer')
crypto = require('crypto');


var accountSid = 'AC2ed93b4650e387a34b2d91ec42b45dda';
var authToken = '00d471248a6e5bebb7bb565309b0c699';
const client = require('twilio')(accountSid, authToken);


app.use(bodyparser.json());
app.use(bodyparser.urlencoded({extended:true}));
app.use(express.static('public'));

let connection = mysql.createConnection({
    connectionLimit : 10,
    aquireTimeOut: 120000,
    host : '139.162.172.118',
    user : 'chatgram_myuser',
    password : '!A9kmWes]F$H',
    database : 'chatgram_chat'
});

function handleDisconnect() {
    connection = mysql.createConnection(connection); // Recreate the connection, since
                                                    // the old one cannot be reused.
  
    connection.connect(function(err) {              // The server is either down
      if(err) {                                     // or restarting (takes a while sometimes).
        console.log('error when connecting to db:', err);
        setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
      }                                     // to avoid a hot loop, and to allow our node script to
    });                                     // process asynchronous requests in the meantime.
                                            // If you're also serving http, display a 503 error.
    connection.on('error', function(err) {
      console.log('db error', err);
      if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
        handleDisconnect();                         // lost due to either server restart, or a
      } else {                                      // connnection idle timeout (the wait_timeout
        throw err;                                  // server variable configures this)
      }
    });
  }
  

// connection.query('CALL AgentTopByCategory(?)',[0],(err,result)=>{
//     if(err){
//         res.status(404).json(err);
//     }else {
//         var obj = {BestTopFoods :result[0], BestTopRest:result[1],BestTopHouse:result[2]};
//        res.json(obj);

//     }
// });

app.get('/', (req, res) => {
    res.send('Chat Server is running on port 3000')
});

app.get('/CheckConnection', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ res: 'ServerConnection' }));
});

const port = process.env.PORT || 3000;
server.listen(port,()=>{
    console.log('Node app is running on port '+port)
});

var users = [];
var oldID;

io.on('connection', (socket) => {
    var phoneUser = socket.handshake.query.phoneUser;
    var myModel={'PhoneNo':phoneUser,'SocketID':socket.id}
    var res = CheckFind(myModel);
    if(res != -1) {
        io.sockets.connected[res].disconnect();
    }
      socket.on('disconnect',function(){
          console.log("disconnect "+socket.id);
          if(users.find(o => o.SocketID === socket.id) != undefined){
                var PhoneNo = users.find(o => o.SocketID === socket.id).PhoneNo;
                var active = 'Disactive';
                connection.query('CALL Mob_updateUserStatus(?,?);',[PhoneNo,active],(err,result)=>{
                    if(err){
                        handleDisconnect();
                     }
                });
                CheckRemove(socket.id);
                console.log('Remove User -->'+PhoneNo);
                socket.disconnect(0);
          }
        });

    socket.on('join', function(modle) {
         var active = 'active';
         connection.query('CALL Mob_updateUserStatus(?,?);',[modle.PhoneNo,active],(err,result)=>{
             if(err){
                handleDisconnect();
             }
         });
         console.log('active '+modle.PhoneNo);
      });
   socket.on('Disjoin', function(modle) {
        var active = 'Disactive';
        connection.query('CALL Mob_updateUserStatus(?,?);',[modle.PhoneNo,active],(err,result)=>{
            if(err){
                handleDisconnect();
             }
        });
        console.log('Disactive '+modle.PhoneNo);
     });

       socket.on('UploadMsg', (obj,callback) => {
        console.log('save msg '+obj.idMsgTbl);
            connection.query('CALL Mob_insertMessage(?,?,?,?,?);',[obj.FromPhone,obj.ToPhone,obj.message,obj.keyTrivim,1],(err,result)=>{
                if(err){
                    handleDisconnect();
                 console.log(err);
                }else {
                    console.log('save msg '+obj.idMsgTbl);
                    var infoCallback={'ToPhone':obj.ToPhone,'idMsgTbl':obj.idMsgTbl,'uuid_messge':result[0][0].uuid};
                    callback(infoCallback); 
                    var infoSend={'message':obj.message,'keyTrivim':obj.keyTrivim,'FromPhone':obj.FromPhone,'uuid_messge':result[0][0].uuid};

                    if(users.find(o => o.PhoneNo === obj.ToPhone)){
                        var id = users.find(o => o.PhoneNo === obj.ToPhone).SocketID;
                        io.to(id).emit('message', infoSend);
                        console.log('send msg '+obj.idMsgTbl);
                    }
                }
            });
        });

       socket.on('typing', (obj) => {
        if(users.find(o => o.PhoneNo === obj.ToPhone)){
            var id = users.find(o => o.PhoneNo === obj.ToPhone).SocketID;
            var infoSend={'isTyping':obj.isTyping,'from':obj.From,'FromPhone':obj.FromPhone}
            io.to(id).emit('typing', infoSend);
           }
        });

        socket.on('recivedEmit', (obj,callback) => {
            var uuid_messge = obj;
                connection.query('CALL Mob_recivedMessage(?);',[uuid_messge],(err,result)=>{
                    if(err){
                         handleDisconnect();
                    }else {
                    //send to other message is recived
                    }
                });
            });

        // socket.on('CheckConnection', (obj) => {
        //     var id = users.find(o => o.NickName === obj.From).SocketID;
        //     var infoSend={'connected':'yes'}
        //      io.to(id).emit('conn', "conn") 
        //      io.to(id).emit('ResultCheckConnection', infoSend) 
        // });

        
});

// function intervalFunc() {
//     for(var i=0;i<users.length;i++){
//         io.sockets.connected[users[i].SocketID].emit("greeting", "You Here!");
//     }
//   };
//   setInterval(intervalFunc, 3000);

function CheckFind(modle){
    let oldID;
    if(users.find(o => o.PhoneNo === modle.PhoneNo) == undefined){
        users.push(modle);
        console.log('user connected  PhoneNo :'+modle.PhoneNo);
        oldID = -1;
    }else{
        var index = users.findIndex(o => o.PhoneNo === modle.PhoneNo);
        //delete users[index].SocketID;
        oldID = users[index].SocketID;
        users[index].SocketID = modle.SocketID;
        console.log(modle.PhoneNo +" is Existing");
    }
    console.log(users);
    return oldID;
};


function CheckRemove(SocketID){
    var index = users.findIndex(o => o.SocketID === SocketID);
    if(index != undefined){
        users.splice(index, 1);
        console.log(users);
    }
};

app.post('/api/getConfigCode',(req,res)=>{
    let PhoneNo = req.body.PhoneNo;
    PhoneNo = '+964' + PhoneNo;
    console.log(PhoneNo);
    let resMsg = "";
    let randCode = Math.floor(1000 + Math.random() * 9000);
    
   resMsg = {"Code":'1234'};
  res.json({"EnterCode":resMsg});
//   client.messages.create(
//       {
//         to: PhoneNo.toString(),
//         from: '+1 727 513 2949',
//         body: 'مرحبا بك كود التفعيل هو '+randCode+' شكرا لك لاستخدام جات كرام',
//       },
//       (err, message) => {
//           if(err) {
//               console.log(err);
//               resMsg = {"Code":'err'};
//               res.json({"EnterCode":resMsg});
//           }
//           else{
//               console.log('sending message');
//               resMsg = {"Code":randCode};
//               res.json({"EnterCode":resMsg});
//           }
//       });
  });

  app.post('/api/getConfigCodeProtected',(req,res)=>{
    let PhoneNo = req.body.PhoneNo;
    PhoneNo = '+964' + PhoneNo;
    console.log(PhoneNo);
    let resMsg = "";
    let randCode = Math.floor(1000 + Math.random() * 9000);
    
   //resMsg = {"Code":'1234'};
  // res.json({"EnterCode":resMsg});
  client.messages.create(
      {
        to: PhoneNo.toString(),
        from: '+1 727 513 2949',
        body: 'مرحبا بك انت من زبائننا المميزين نحن نرسل هذا رمز كل اربعة وعشرون ساعة ساعه لحمايتك افضل رمز الحمايه هو :'+randCode+' شكرا لك لاستخدام جات كرام',
      },
      (err, message) => {
          if(err) {
              console.log(err);
              resMsg = {"Code":'err'};
              res.json({"EnterCode":resMsg});
          }
          else{
              console.log('sending message');
              resMsg = {"Code":randCode};
              res.json({"EnterCode":resMsg});
          }
      });
  });

 // Upload Images
  var filename,obj,folderName;
  var Storage = multer.diskStorage({
    destination: function(req, file, callback) {
        callback(null, folderName);
    },
    filename: function(req, file, callback) {
        filename =  file.fieldname + "_" + Date.now() + "_" + file.originalname;
        callback(null,filename);
    }
});
var upload = multer({
    storage: Storage
}).array("file", 3); 

app.post("/api/uploadImage", function(req, res) {
    console.log("arrive image "+filename);
    folderName = './public/uploads_Images/';
    upload(req, res, function(err) {
        if (err) {
            return console.log("Error Upload Image "+err);
        }else{
        console.log("Scees Save :"+filename);
        obj = JSON.parse(req.body.obj);
        connection.query('CALL Mob_insertMessage(?,?,?,?,?);',[obj.FromPhone,obj.ToPhone,filename,obj.keyTrivim,3],(err,result)=>{
            if(err){
                handleDisconnect();
                res.status(404).send("err");
                return console.log("Error DB Save Image "+err);
            }else {
                var infoCallback={'ToPhone':obj.ToPhone,'idMsgTbl':obj.idMsgTbl,'uuid_messge':result[0][0].uuid};
            
                var infoSend={'img':filename,'FromPhone':obj.FromPhone,'uuid_messge':result[0][0].uuid,'keyTrivim':obj.keyTrivim};
                if(users.find(o => o.PhoneNo === obj.ToPhone)){
                    var id = users.find(o => o.PhoneNo === obj.ToPhone).SocketID;
                    io.to(id).emit('ReciveImg', infoSend);
                    console.log("send "+filename);
                }
                res.json({result:infoCallback});
            }
        });
      }
    });
});

  
app.post("/api/uploadFile", function(req, res) {
    folderName = './public/uploads_files/';
    upload(req, res, function(err) {
        if (err) {
            console.log("Something went wrong!");
        }else{
        obj = JSON.parse(req.body.obj);
        connection.query('CALL Mob_insertMessage(?,?,?,?,?);',[obj.FromPhone,obj.ToPhone,filename,"keyTrivim",2],(err,result)=>{
            if(err){
                handleDisconnect();
            }else {
                var infoCallback={'ToPhone':obj.ToPhone,'idMsgTbl':obj.idMsgTbl,'uuid_messge':result[0][0].uuid};
                var infoSend={'realName':obj.fileName,'objName':filename,'FromPhone':obj.FromPhone,'uuid_messge':result[0][0].uuid};
                if(users.find(o => o.PhoneNo === obj.ToPhone)){
                    var id = users.find(o => o.PhoneNo === obj.ToPhone).SocketID;
                    io.to(id).emit('ReciveFile', infoSend);
                }
                res.json({mainResult:infoCallback});
            }
        });
      }
    });
});

app.post('/api/getDeferredMessage',(req,res)=>{
        let PhoneNo = req.body.PhoneNo;
        connection.query('CALL Mob_getDeferredMessage(?);',[PhoneNo],(err,result)=>{
            if(err){
                handleDisconnect();
                res.status(404).json(err);
            }else {
                res.json({"Deferredresult":result[0]});
            }
      });
});
app.post('/api/updateDeferredMessage',(req,res)=>{
    let PhoneNo = req.body.PhoneNo;
    connection.query('CALL Mob_updateDeferredMessage(?);',[PhoneNo],(err,result)=>{
        if(err){
            handleDisconnect();
        }else {
           // res.json({"Deferredresult":result[0]});
        }
  });
});

  app.post('/api/checkPhoneHaveAccount',(req,res)=>{
    let PhoneNo = req.body.PhoneNo;
    let e = req.body.e;
    let n = req.body.n;
    console.log(e+":"+n);
    connection.query('CALL Mob_checkPhoneHaveAccount(?,?,?);',[PhoneNo,e,n],(err,result)=>{
        if(err){
            handleDisconnect();
            console.log(err);
            res.status(404).json(err);
        }else {
            res.json({"result":result[0]});
        }
    });
  });

  app.post('/api/insertUser',(req,res)=>{
    folderName = './public/profile_Images/';
    upload(req, res, function(err) {
        if (err) {
            return console.log("Error Upload Image "+err);
        }else{
        obj = JSON.parse(req.body.obj);
        connection.query('CALL Mob_insertUser(?,?,?,?,?)',[obj.nickName,obj.phoneNumber,filename,obj.e,obj.n],(err,result)=>{
            if(err){
                handleDisconnect();
                res.status(404).send("err");
            }else {
                res.json({"result":result[0]})
            }
        });
      }
    });
  });

  app.post('/api/LoadLastBlock',(req,res)=>{
    let lastDownload = req.body.lastDownload;
    let PhoneNo = req.body.PhoneNo; 
    console.log(lastDownload+":"+PhoneNo);
    connection.query('CALL Mob_LoadLastBlock(?,?)',[lastDownload,PhoneNo],(err,result)=>{
        if(err){
            handleDisconnect();
            res.status(404).send(err);
        }else {
            var infoCallback={'blockInfo':result[0],'VipInfo':result[1]};
            res.json({"result":infoCallback});
        }
    });
  });

  app.post('/api/getMyFreinds',(req,res)=>{
    let JsonArr = JSON.parse(req.body.JsonArr);
    let OwnerPhone = req.body.OwnerPhone;
    let currentDate = req.body.currentDate;
    JsonArrStr ='(';

    for(var item of JsonArr) {
        let phone = '\''+item.PhoneFriend+'\'';
        JsonArrStr += phone+',';
    }
    JsonArrStr = JsonArrStr.substring(0, JsonArrStr.length-1);
    JsonArrStr += ')';

    console.log(OwnerPhone);
    console.log(currentDate);
    console.log(JsonArrStr);
    connection.query('CALL Mob_getFriends(?,?,?);',[JsonArrStr,OwnerPhone,currentDate],(err,result)=>{
        if(err){
           handleDisconnect();
           console.log(err);
            res.status(404).json(err);
        }else {
            res.json({"result":result[0]});
        }
    });

  });

  app.post('/api/getStatusUser',(req,res)=>{
    let PhoneNo = req.body.PhoneNo;
    connection.query('CALL Mob_getUserStatus(?);',[PhoneNo],(err,result)=>{
        if(err){
            handleDisconnect();
            res.status(404).json(err);
        }else {
            res.json({"resultgetStatus":result[0]});
        }
    });
  });

  
  app.post('/api/blockFriend',(req,res)=>{
    let myPhone = req.body.myPhone;
    let friendPhone = req.body.friendPhone;
    let state = req.body.state;
    let date = req.body.date;
    connection.query('CALL Mob_blockFriend(?,?,?,?);',[myPhone,friendPhone,state,date],(err,result)=>{
        if(err){
            handleDisconnect();
            res.status(404).json(err);
        }else {
            res.json({"resultgetStatus":"Blocked"});
        }
    });
  });