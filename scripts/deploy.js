const hre = require("hardhat");

async function main() {
  const CertificateNFT = await hre.ethers.getContractFactory("EDUCHAIN_NFT");
  const contract = await CertificateNFT.deploy();
  await contract.deployed();
  console.log("EDUCHAIN_NFT deployed to:", contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
