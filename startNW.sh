
pushd ~/fabric-samples/test-network

./network.sh dwon
./network.sh up createChannel -c mychannel -ca -s couchdb
./network.sh deployCC -ccn basic -ccp ../asset-transfer-basic/chaincode-go/ -ccl go -cci initLedger

popd