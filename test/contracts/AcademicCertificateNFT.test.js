const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AcademicCertificateNFT", function () {
  let contract;
  let owner;
  let institution1;
  let institution2;
  let student1;
  let student2;

  beforeEach(async function () {
    [owner, institution1, institution2, student1, student2] = await ethers.getSigners();
    
    const AcademicCertificateNFT = await ethers.getContractFactory("AcademicCertificateNFT");
    contract = await AcademicCertificateNFT.deploy();
    await contract.deployed();
  });

  describe("Institution Registration", function () {
    it("Should register an institution", async function () {
      await contract.connect(institution1).registerInstitution(
        "Makerere University",
        "MAK001"
      );

      const institution = await contract.institutions(institution1.address);
      expect(institution.name).to.equal("Makerere University");
      expect(institution.registrationNumber).to.equal("MAK001");
      expect(institution.isVerified).to.be.false;
    });

    it("Should not allow duplicate institution registration", async function () {
      await contract.connect(institution1).registerInstitution(
        "Makerere University",
        "MAK001"
      );

      await expect(
        contract.connect(institution1).registerInstitution(
          "Another University",
          "MAK002"
        )
      ).to.be.revertedWith("Institution already registered");
    });

    it("Should require institution name", async function () {
      await expect(
        contract.connect(institution1).registerInstitution("", "MAK001")
      ).to.be.revertedWith("Institution name required");
    });
  });

  describe("Institution Verification", function () {
    beforeEach(async function () {
      await contract.connect(institution1).registerInstitution(
        "Makerere University",
        "MAK001"
      );
    });

    it("Should allow owner to verify institution", async function () {
      await contract.connect(owner).verifyInstitution(institution1.address);
      
      const institution = await contract.institutions(institution1.address);
      expect(institution.isVerified).to.be.true;
    });

    it("Should not allow non-owner to verify institution", async function () {
      await expect(
        contract.connect(institution2).verifyInstitution(institution1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should emit InstitutionVerified event", async function () {
      await expect(contract.connect(owner).verifyInstitution(institution1.address))
        .to.emit(contract, "InstitutionVerified")
        .withArgs(institution1.address);
    });
  });

  describe("Certificate Issuance", function () {
    beforeEach(async function () {
      await contract.connect(institution1).registerInstitution(
        "Makerere University",
        "MAK001"
      );
      await contract.connect(owner).verifyInstitution(institution1.address);
    });

    it("Should issue a certificate", async function () {
      const graduationDate = Math.floor(Date.now() / 1000) - 86400; // Yesterday
      
      await expect(
        contract.connect(institution1).issueCertificate(
          student1.address,
          "SEKIZIYIVU PAUL",
          "STU001",
          "Computer Science",
          "First Class",
          "Degree",
          graduationDate,
          "QmTestHash123456789012345678901234567890123456"
        )
      ).to.emit(contract, "CertificateIssued");

      const certificate = await contract.certificates(1);
      expect(certificate.studentName).to.equal("SSEKIZIYIVU PAUL");
      expect(certificate.courseName).to.equal("Computer Science");
      expect(certificate.grade).to.equal("First Class");
      expect(certificate.isRevoked).to.be.false;
    });

    it("Should not allow unverified institution to issue certificate", async function () {
      await contract.connect(institution2).registerInstitution(
        "Kampala University",
        "KU001"
      );

      const graduationDate = Math.floor(Date.now() / 1000) - 86400;

      await expect(
        contract.connect(institution2).issueCertificate(
          student1.address,
          "Jane PAUL",
          "STU002",
          "Business Administration",
          "Second Class Upper",
          "Degree",
          graduationDate,
          "QmTestHash123456789012345678901234567890123456"
        )
      ).to.be.revertedWith("Institution not verified");
    });

    it("Should not allow duplicate certificates", async function () {
      const graduationDate = Math.floor(Date.now() / 1000) - 86400;
      
      await contract.connect(institution1).issueCertificate(
        student1.address,
        "SEKIZIYIVU PAUL",
        "STU001",
        "Computer Science",
        "First Class",
        "Degree",
        graduationDate,
        "QmTestHash123456789012345678901234567890123456"
      );

      await expect(
        contract.connect(institution1).issueCertificate(
          student1.address,
          "SEKIZIYIVU PAUL",
          "STU001",
          "Computer Science",
          "First Class",
          "Degree",
          graduationDate,
          "QmTestHash123456789012345678901234567890123457"
        )
      ).to.be.revertedWith("Certificate already exists for this student and course");
    });

    it("Should reject future graduation dates", async function () {
      const futureDate = Math.floor(Date.now() / 1000) + 86400; // Tomorrow

      await expect(
        contract.connect(institution1).issueCertificate(
          student1.address,
          "SEKIZIYIVU PAUL",
          "STU001",
          "Computer Science",
          "First Class",
          "Degree",
          futureDate,
          "QmTestHash123456789012345678901234567890123456"
        )
      ).to.be.revertedWith("Invalid graduation date");
    });
  });

  describe("Certificate Verification", function () {
    beforeEach(async function () {
      await contract.connect(institution1).registerInstitution(
        "Makerere University",
        "MAK001"
      );
      await contract.connect(owner).verifyInstitution(institution1.address);
      
      const graduationDate = Math.floor(Date.now() / 1000) - 86400;
      await contract.connect(institution1).issueCertificate(
        student1.address,
        "SEKIZIYIVU PAUL",
        "STU001",
        "Computer Science",
        "First Class",
        "Degree",
        graduationDate,
        "QmTestHash123456789012345678901234567890123456"
      );
    });

    it("Should verify existing certificate", async function () {
      const result = await contract.verifyCertificate(1);
      
      expect(result.exists).to.be.true;
      expect(result.isRevoked).to.be.false;
      expect(result.studentName).to.equal("SEKIZIYIVU PAUL");
      expect(result.courseName).to.equal("Computer Science");
      expect(result.institutionName).to.equal("Makerere University");
      expect(result.grade).to.equal("First Class");
    });

    it("Should return false for non-existent certificate", async function () {
      const result = await contract.verifyCertificate(999);
      expect(result.exists).to.be.false;
    });
  });

  describe("Certificate Revocation", function () {
    beforeEach(async function () {
      await contract.connect(institution1).registerInstitution(
        "Makerere University",
        "MAK001"
      );
      await contract.connect(owner).verifyInstitution(institution1.address);
      
      const graduationDate = Math.floor(Date.now() / 1000) - 86400;
      await contract.connect(institution1).issueCertificate(
        student1.address,
        "SEKIZIYIVU PAUL",
        "STU001",
        "Computer Science",
        "First Class",
        "Degree",
        graduationDate,
        "QmTestHash123456789012345678901234567890123456"
      );
    });

    it("Should allow institution to revoke its certificate", async function () {
      await expect(
        contract.connect(institution1).revokeCertificate(1, "Academic misconduct")
      ).to.emit(contract, "CertificateRevoked")
        .withArgs(1, "Academic misconduct");

      const certificate = await contract.certificates(1);
      expect(certificate.isRevoked).to.be.true;
    });

    it("Should not allow other institutions to revoke certificate", async function () {
      await contract.connect(institution2).registerInstitution(
        "Kampala University",
        "KU001"
      );
      await contract.connect(owner).verifyInstitution(institution2.address);

      await expect(
        contract.connect(institution2).revokeCertificate(1, "Some reason")
      ).to.be.revertedWith("Only issuing institution can revoke");
    });

    it("Should not allow revoking already revoked certificate", async function () {
      await contract.connect(institution1).revokeCertificate(1, "Academic misconduct");

      await expect(
        contract.connect(institution1).revokeCertificate(1, "Another reason")
      ).to.be.revertedWith("Certificate already revoked");
    });
  });

  describe("Certificate Queries", function () {
    beforeEach(async function () {
      await contract.connect(institution1).registerInstitution(
        "Makerere University",
        "MAK001"
      );
      await contract.connect(owner).verifyInstitution(institution1.address);
    });

    it("Should return certificates by student", async function () {
      const graduationDate = Math.floor(Date.now() / 1000) - 86400;
      
      await contract.connect(institution1).issueCertificate(
        student1.address,
        "SEKIZIYIVU PAUL",
        "STU001",
        "Computer Science",
        "First Class",
        "Degree",
        graduationDate,
        "QmTestHash123456789012345678901234567890123456"
      );

      await contract.connect(institution1).issueCertificate(
        student1.address,
        "SEKIZIYIVU PAUL",
        "STU001",
        "Mathematics",
        "Second Class Upper",
        "Certificate",
        graduationDate,
        "QmTestHash123456789012345678901234567890123457"
      );

      const certificates = await contract.getCertificatesByStudent("STU001");
      expect(certificates.length).to.equal(2);
    });

    it("Should return certificates by institution", async function () {
      const graduationDate = Math.floor(Date.now() / 1000) - 86400;
      
      await contract.connect(institution1).issueCertificate(
        student1.address,
        "SEKIZIYIVU PAUL",
        "STU001",
        "Computer Science",
        "First Class",
        "Degree",
        graduationDate,
        "QmTestHash123456789012345678901234567890123456"
      );

      await contract.connect(institution1).issueCertificate(
        student2.address,
        "Jane Smith",
        "STU002",
        "Engineering",
        "First Class",
        "Degree",
        graduationDate,
        "QmTestHash123456789012345678901234567890123457"
      );

      const certificates = await contract.getCertificatesByInstitution(institution1.address);
      expect(certificates.length).to.equal(2);
    });

    it("Should return total certificates count", async function () {
      const graduationDate = Math.floor(Date.now() / 1000) - 86400;
      
      await contract.connect(institution1).issueCertificate(
        student1.address,
        "SEKIZIYIVU PAUL",
        "STU001",
        "Computer Science",
        "First Class",
        "Degree",
        graduationDate,
        "QmTestHash123456789012345678901234567890123456"
      );

      const total = await contract.getTotalCertificates();
      expect(total).to.equal(1);
    });
  });

  describe("Access Control", function () {
    it("Should only allow owner to pause contract", async function () {
      await contract.connect(owner).pause();
      expect(await contract.paused()).to.be.true;

      await expect(
        contract.connect(institution1).pause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should not allow operations when paused", async function () {
      await contract.connect(owner).pause();

      await expect(
        contract.connect(institution1).registerInstitution("Test", "TEST001")
      ).to.be.revertedWith("Pausable: paused");
    });
  });
});