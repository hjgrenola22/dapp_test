
//package.json 파일 npm install

const express = require("express");
const path = require("path")
const bodyparser = require("body-parser")

//fabric-examples를 사용하기 위한 파일
const FabricCAServices = require('fabric-ca-client');
const { Wallets, Gateway } = require('fabric-network');
const fs = require('fs');

const PORT = 3000
const HOST = "0.0.0.0"
const app = express();

app.use(express.static(path.join(__dirname,"/views")))
/* 주소창에서 쳤을 때 direct로 html파일을 이름만 치기 위해서 사용
'/'있든 없든 상관없다 */


app.listen(PORT,HOST)

app.use(bodyparser.urlencoded({extended:false}))
app.use(bodyparser.json())

app.get("/", (req, res) => {
    console.log("/ 루트 디렉토리")
    console.log("__dirname:"+__dirname)
    
    res.sendFile(path.join(__dirname,"views/SE_index.html"))
    /*sendFile은 위에 express.static과 상관없이 경로를 다 지정해줘야 된다
    '/'는 있든 없든 상관없다
    res.end() -> 있으면 안된다 */
})

 //현재 디렉토리에서 test-network의 org, msp 등에 대한 정보가 담겨있는 json 파일을 찾아간다       
 const ccpPath = path.resolve(__dirname, '..', '..', '..', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
 const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'))

/* 

프라이빗 네트워크에선 원래 관리자가 로그인해서 해당 사용자의 신원을 확인 후 관리자 계정으로 로그인해서 사용자 지갑을
생성해 줘야 하는데 여기선 
1)관리자가 지갑생성 - 지갑이 관리자 인증이고 지갑을 생성하면 네트워크 접속 허가가 생기는 거다
2)사용자가 직접 지갑생성 - 관리자가 생성해주는 단계 생략
3)자산 생성 - 관리자나 사용자나 지갑을 가지고 있으면 자산 생성 다 가능
4)자산 CRUD

|지갑이 그냥 로그인 할 때 사용하는 id고 지갑이 만들어지면서 인증이 되고, 네트워크에 접속 할 수 있는 허가를 받는거다 
|자산은 로그인하면 해당 로그인당 생성할 수 있는 데이터

*/

//서버측에 /admin_wallet 주소 앞에 / 필수

//관리자 지갑 생성
app.post('/admin_wallet', async (req, res) => {

    var id = req.body.id;
    var pw = req.body.pw

    console.log(`admin_wallet id:${id} ,pw:${pw}`)

    try{    
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        
        //connection-org1.json 정보를 가져온다
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        
        //FabricCAServices로 네트워크에 접근 할 수 있는 ca 생성
        const ca = new FabricCAServices(caInfo.url, {trustedRoots: caTLSCACerts, verify:false}, caInfo.caName);
        
        /* process.cwd() node명령을 호출한 작업디렉터리의 절대경로
        /home/bstudent/dev/first-project/SE_application 여기에서
        wallet 디렉토리를 가져온다 */
        const walletPath = path.join(process.cwd(), 'wallet')
        
        //wlletPath에 가서 wallet을 객체화 한다
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        
        //기존에 있는 wallet인지 체크
        const admin_identity = await wallet.get(id)
        if(admin_identity){//새로만드는 건 있으면 error
            console.log(`An identity for the admin user "${id}" already exists in the wallet`);

            var str = `An identity for the admin user "${id}" already exists in the wallet`
            var jsonmsg = {'result':'failed','msg':str}
            res.status(200).json(jsonmsg)

            return;
        }

        //ca에 가서 admin 인증서를 가져온다
        const enrollment = await ca.enroll({enrollmentID:'admin', enrollmentSecret:'adminpw'})
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509'
        }
        //id로 지갑생성
        await wallet.put(id, x509Identity)
        
        console.log(`Successfully enrolled admin user "${id}" and imported it into the wallet`);
        str = `Successfully enrolled admin user "${id}" and imported it into the wallet`
        jsonmsg = {result:"SUCCESS",msg:str}

        res.status(200).json(jsonmsg)

    }catch(error){
        console.error(`Failed to enroll admin_wallet:${error}`)
        var str = `Failed to enroll admin_wallet:${error}`
        var jsonmsg = {'result':'failed', 'msg':str}

        res.status(200).json(jsonmsg)
    }
})

//사용자 지갑 생성
app.post('/user_wallet', async function(req, res){
    var id = req.body.id;
    var role = req.body.role;

    //console.log(id, role)

    try {
        // Create a new CA client for interacting with the CA.
        //인증서를 가져온다
        const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
        const ca = new FabricCAServices(caURL);

        // Create a new file system based wallet for managing identities.
        //지갑을 가져온다
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check to see if we've already enrolled the user.
        //user의 id 유무를 체크
        const userIdentity = await wallet.get(id);
        if (userIdentity) { //새로만드는 건 있으면 error
            console.log(`An identity for the user "${id}" already exists in the wallet`);

            var str = `An identity for the user "${id}" already exists in the wallet`
            var jsonmsg = {'result':'failed', 'msg':str}
            res.status(200).json(jsonmsg)

            return;
        }

        // Check to see if we've already enrolled the admin user.
        /*관리자 아이디로 로그인해서 지갑을 생성해 줘야 하는데 그냥 "admin"으로 고정하고 사용자가 지갑 생성
        관리자 admin 존재유무 확인*/
        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            console.log('An identity for the admin user "admin" does not exist in the wallet');
           
            var str = 'An identity for the admin user "admin" does not exist in the wallet'
            var jsonmsg = {'result':'failed', 'msg':str}
            res.status(200).json(jsonmsg)

            return;
        }

        // build a user object for authenticating with the CA
        //admin 값으로 ca에 접근해서 user 객체를 만든다
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Register the user, enroll the user, and import the new identity into the wallet.
        //id와 role, adminUser값으로 secret을 만든다
        const secret = await ca.register({
            affiliation: 'org1.department1',
            enrollmentID: id,
            role: role
        }, adminUser);

        console.log("secret:",secret)
        //secret으로 enroll한다. secret 값으로 user가 이후에 인증서를 재발급 받을 수 있다
        const enrollment = await ca.enroll({
            enrollmentID: id,
            enrollmentSecret: secret
        });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };
        //id 이름으로 지갑 생성. 즉 지갑에 put 하는 게 생성하는 거다
        await wallet.put(id, x509Identity);
        console.log(`Successfully registered and enrolled admin user "${id}" and imported it into the wallet`);

        // 결과값 출력
        var str = `Successfully registered and enrolled admin user "${id}" and imported it into the wallet`
        var jsonmsg = {'result':'SUCCESS', 'msg':str}

        res.status(200).json(jsonmsg)

    } catch (error) {
        console.error(`Failed to register user "${id}": ${error}`);
       
        var str = `Failed to register user "${id}": ${error}`
        var jsonmsg = {'result':'failed', 'msg':str}

        res.status(200).json(jsonmsg)
    }
})

/* 지갑이 그냥 id면 해당 id로 로그인했을 때 저장된 값들. 이게 자산이다 */

//자산 생성
app.post('/createasset', async (req, res) => {
    var cert = req.body.cert
    var name = req.body.name
    var color = req.body.color
    var size = req.body.size
    var owner = req.body.owner
    var value = req.body.value

    console.log(`asset-post: cert-${cert} name-${name} color-${color} size-${size} owner-${owner} appraisedValue-${value}`)

    //다른 페이지로 결과를 전송하기 위해서 해당 파일을 가져온다
    const resultPath = path.join(__dirname, "views/result.html")
    var resultHTML = fs.readFileSync(resultPath, "utf-8")

    try {
        /*자산생성에서 ca연결은 필요없다. 지갑 유무로 인증을 하고
        cc에 있는 함수호출*/

        // Create a new file system based wallet for managing identities.
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        //지갑만 있으면 되기 때문에 관리자든 사용자든 상관없이 지갑 유무만 체크한다
        const userIdentity = await wallet.get(cert);
        if (!userIdentity) { //관리자나 사용자가 없으면 error
            console.log(`An identity for the ${cert} not exists in the wallet`);

            var str1 = `An identity for the ${cert} not exists in the wallet`
            var str2 = `생성자: ${cert} , 자산이름: ${name}`

            resultHTML = resultHTML.replace("msgtitle", str1)
            resultHTML = resultHTML.replace("contents", str2)

            res.status(200).send(resultHTML)

            return;
        }

        //블록체인 네트워크에 접속.  Gateway를 사용하기 위해서 상단에 import
        const gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: cert,
            discovery: { enabled: true, asLocalhost: true } //그냥 옵션 부분
        })

        const network = await gateway.getNetwork("mychannel");//채널 연결
        const contract = network.getContract("basic");//채널 코드 연결
        
        //여기까지 ChainCode 호출 설정, 밑에서부터 자산 생성 --------------------------

        //cc에서 CreateAsset 호출해서 name 이름으로 자산 생성
        await contract.submitTransaction('CreateAsset', name, color, size, owner, value);
      
        //다른 페이지로 결과 전송하기---------------------
        var str1 = `<p>Transaction has been submiteed</P><br>`
        var str2 = `생성자: ${cert} , 자산이름: ${name}`

        resultHTML = resultHTML.replace("msgtitle", str1)
        resultHTML = resultHTML.replace("contents", str2)

        res.status(200).send(resultHTML)
        //다른 페이지로 결과 전송하기 end ---------------------

        //close(fs)
        await gateway.disconnect();

    } catch (error) {
        console.error(`Failed to create asset "${cert}": ${error}`);
        var str = `Failed to create asset "${cert}": ${error}`
       
        resultHTML = resultHTML.replace("msgtitle", "실패입니다")
        resultHTML = resultHTML.replace("contents", str)

        console.log("resultHTML:"+resultHTML)

        res.status(200).send(resultHTML)
        close(fs)
    } 
})

/*
    res.writeHead(200, {"Content-Type":"text/html; charset=utf-8"})
    res.write("<h1>Express 서버에서 응답한 결과입니다.</h1>")
    res.write(`<p>An identity for the ${cert} not exists in the wallet</p>`)
    res.end()

    res 메세지는 최초 /readasset 으로 로딩했을 때 뜬다
*/
//자산 조회
app.get('/readasset', async (req, res) => {

    var cert = req.query.cert;//관리자나 사용자 id
    var name = req.query.name;//asset이름

    try {
        // Create a new file system based wallet for managing identities.
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check to see if we've already enrolled the user.
        //지갑으로 인증확인이니깐 관리자나 사용자 id
        const identity = await wallet.get(cert);
        if (!identity) { //관리자나 생성자가 없으면 error
            console.log(`An identity for the "${cert}" not exist in the wallet`);
           
            var str = `An identity for the "${cert}" not exist in the wallet`
            var jsonmsg = {'result':'failed', 'msg':str}
    
            res.status(200).json(jsonmsg)

            return;
        }

        // Create a new gateway for connecting to our peer node.
        //cert로 블록체인 네트워크 접속
        const gateway = new Gateway();
        await gateway.connect(ccp, { wallet, identity: cert, discovery: { enabled: true, asLocalhost: true } });

        // Get the network (channel) our contract is deployed to.
        //채널 연결
        const network = await gateway.getNetwork('mychannel');

        // Get the contract from the network.
        //체인코드 연결
        const contract = network.getContract('basic');

        // Evaluate the specified transaction.
        // queryCar transaction - requires 1 argument, ex: ('queryCar', 'CAR4')
        // queryAllCars transaction - requires no arguments, ex: ('queryAllCars')
        resultMsg = await contract.evaluateTransaction('ReadAsset', name);
        //console.log(resultMsg) 주소를 받아오는 byte값
        //console.log(`${resultMsg}`) byte값을 문자열로
        //console.log(JSON.parse(`${resultMsg}`)) 문자열을 자바스크립트 객체로 변환
        console.log(JSON.parse(`${resultMsg}`))
        await gateway.disconnect();

          // 결과값 출력
        var str = `Successfully registered and enrolled admin user "${name}" and imported it into the wallet`
        var jsonmsg = {'result':'SUCCESS', 'msg': JSON.parse(`${resultMsg}`)}

        res.status(200).json(jsonmsg)
        
    } catch (error) {
        console.log(`Failed to query user "${name}": ${error}`)

        var str = `Failed to query user "${name}": ${error}`
        var jsonmsg = {'result':'failed', 'msg':str}

        res.status(200).json(jsonmsg)

        return;
    }

})



console.log(`PORT:${PORT} HOST:${HOST} is connected`)

/*
콜백 함수
console.log("1")
function add(a, b, callback){
    result = a + b;
    console.log("callback before")
    callback(result)
    console.log("callback after")
}
console.log("2")
add(12, 23, function(result){
    console.log(`result:${result} in call add`)
})

//동기, 비동기 예제
var fs = require("fs")

console.log("=========== readFileSync의 동기적 기능 ===============")

console.log("A")
//readFileSync : 동기로 작동
var result = fs.readFileSync('sysntax/sample.txt', 'utf8')
console.log(result)
console.log('C')

console.log("=========== readFile의 비동기적 기능 ================")

console.log('A')
fs.readFile('sysntax/sample.txt', 'utf8', function(err, result){
    console.log(result)
});
console.log('C')
*/
