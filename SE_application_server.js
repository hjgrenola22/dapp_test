
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
        if(admin_identity){
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

app.post('/user_wallet', async function(req, res){
    var id = req.body.id;
    var role = req.body.role;

    //console.log(id, role)

    try {
        // Create a new CA client for interacting with the CA.
        const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
        const ca = new FabricCAServices(caURL);

        // Create a new file system based wallet for managing identities.
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check to see if we've already enrolled the user.
        const userIdentity = await wallet.get(id);
        if (userIdentity) {
            console.log(`An identity for the user "${id}" already exists in the wallet`);

            var str = `An identity for the user "${id}" already exists in the wallet`
            var jsonmsg = {'result':'failed', 'msg':str}
            res.status(200).json(jsonmsg)

            return;
        }

        // Check to see if we've already enrolled the admin user.
        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            console.log('An identity for the admin user "admin" does not exist in the wallet');
           
            var str = 'An identity for the admin user "admin" does not exist in the wallet'
            var jsonmsg = {'result':'failed', 'msg':str}
            res.status(200).json(jsonmsg)

            return;
        }

        // build a user object for authenticating with the CA
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Register the user, enroll the user, and import the new identity into the wallet.
        const secret = await ca.register({
            affiliation: 'org1.department1',
            enrollmentID: id,
            role: role
        }, adminUser);

        console.log("secret:",secret)

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
        await wallet.put(id, x509Identity);
        console.log(`Successfully registered and enrolled admin user "${id}" and imported it into the wallet`);

        var str = `Successfully registered and enrolled admin user "${id}" and imported it into the wallet`
        var jsonmsg = {'result':'SUCCESS', 'msg':str}

        res.status(200).json(jsonmsg)

    } catch (error) {
        console.error(`Failed to register user "appUser": ${error}`);
       
        var str = `Failed to register user "appUser": ${error}`
        var jsonmsg = {'result':'failed', 'msg':str}

        res.status(200).json(jsonmsg)
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
