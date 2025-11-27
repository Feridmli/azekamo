import { Buffer } from "buffer";
window.Buffer = window.Buffer || Buffer;

import { ethers } from "ethers";
import { Seaport } from "@opensea/seaport-js";

// ==========================================
// KONFIQURASIYA VƏ SABİTLƏR
// ==========================================

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  window?.__BACKEND_URL__ ||
  "https://azekamo20.onrender.com";

const NFT_CONTRACT_ADDRESS =
  import.meta.env.VITE_NFT_CONTRACT ||
  window?.__NFT_CONTRACT__ ||
  "0x54a88333F6e7540eA982261301309048aC431eD5";

// Seaport 1.5/1.6 Canonical Address
const SEAPORT_CONTRACT_ADDRESS = "0x0000000000000068F116a894984e2DB1123eB395";

const APECHAIN_ID = 33139;
const APECHAIN_ID_HEX = "0x8173";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

// Qlobal Dəyişənlər
let provider = null;
let signer = null;
let seaport = null;
let userAddress = null;

// HTML Elementləri
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const addrSpan = document.getElementById("addr");
const marketplaceDiv = document.getElementById("marketplace");
const noticeDiv = document.getElementById("notice");

// ==========================================
// KÖMƏKÇİ FUNKSİYALAR
// ==========================================

function notify(msg, timeout = 3000) {
  if (!noticeDiv) return;
  noticeDiv.textContent = msg;
  console.log(`[NOTIFY]: ${msg}`);
  if (timeout)
    setTimeout(() => {
      if (noticeDiv.textContent === msg) noticeDiv.textContent = "";
    }, timeout);
}

// Order-i JSON formatına salmaq (BigNumber problemlərini həll edir)
function orderToJsonSafe(obj) {
  return JSON.parse(
    JSON.stringify(obj, (k, v) => {
      if (v && typeof v === "object") {
        if (ethers.BigNumber.isBigNumber(v)) return v.toString();
        if (v._hex) return ethers.BigNumber.from(v._hex).toString();
      }
      if (typeof v === "bigint") return v.toString();
      return v;
    })
  );
}

// IPFS linklərini düzəltmək
function resolveIPFS(url) {
  if (!url) return "https://via.placeholder.com/300?text=No+Image";
  const GATEWAY = "https://cloudflare-ipfs.com/ipfs/";
  if (url.startsWith("ipfs://")) return url.replace("ipfs://", GATEWAY);
  if (url.startsWith("Qm") && url.length >= 46) return `${GATEWAY}${url}`;
  return url;
}

// ==========================================
// CÜZDAN QOŞULMASI
// ==========================================

async function connectWallet() {
  try {
    if (!window.ethereum) return alert("Metamask tapılmadı!");
    
    // 'any' istifadə edirik ki, chain dəyişəndə error verməsin
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    
    await provider.send("eth_requestAccounts", []);
    const network = await provider.getNetwork();

    // ApeChain yoxlanışı
    if (network.chainId !== APECHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: APECHAIN_ID_HEX,
              chainName: "ApeChain Mainnet",
              nativeCurrency: { name: "APE", symbol: "APE", decimals: 18 },
              rpcUrls: [import.meta.env.VITE_APECHAIN_RPC || "https://rpc.apechain.com"],
              blockExplorerUrls: ["https://apescan.io"],
            },
          ],
        });
        
        // Şəbəkə dəyişəndən sonra provideri yeniləyirik
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        notify("Şəbəkə dəyişdirildi. Zəhmət olmasa gözləyin...");
      } catch (e) {
        console.error("Network switch error:", e);
        return alert("ApeChain şəbəkəsinə keçilmədi.");
      }
    }

    signer = provider.getSigner();
    userAddress = (await signer.getAddress()).toLowerCase();

    // Seaport instansiyası
    seaport = new Seaport(signer, { overrides: { contractAddress: SEAPORT_CONTRACT_ADDRESS } });
    
    // UI Update
    connectBtn.style.display = "none";
    disconnectBtn.style.display = "inline-block";
    addrSpan.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    notify("Cüzdan qoşuldu!");
    
    await loadNFTs();
  } catch (err) {
    console.error(err);
    alert("Wallet connect xətası: " + err.message);
  }
}

disconnectBtn.onclick = () => {
  provider = signer = seaport = userAddress = null;
  connectBtn.style.display = "inline-block";
  disconnectBtn.style.display = "none";
  addrSpan.textContent = "";
  marketplaceDiv.innerHTML = "";
  notify("Cüzdan ayırıldı", 2000);
};

connectBtn.onclick = connectWallet;

// ==========================================
// NFT YÜKLƏMƏ
// ==========================================

let loadingNFTs = false;
let loadedCount = 0;
const BATCH_SIZE = 12;
let allNFTs = [];

async function loadNFTs() {
  if (loadingNFTs) return;
  loadingNFTs = true;
  try {
    // İlk dəfə yükləyirsə backend-dən çək
    if (allNFTs.length === 0) {
      const res = await fetch(`${BACKEND_URL}/api/nfts`);
      const data = await res.json();
      allNFTs = data.nfts || [];
    }

    if (loadedCount >= allNFTs.length) {
      if (loadedCount === 0)
        marketplaceDiv.innerHTML = "<p style='color:white; text-align:center;'>Bu səhifədə hələ NFT yoxdur.</p>";
      return;
    }

    const batch = allNFTs.slice(loadedCount, loadedCount + BATCH_SIZE);
    loadedCount += batch.length;

    for (const nft of batch) {
      const tokenid = nft.tokenid;
      const name = nft.name || `NFT #${tokenid}`;
      const image = resolveIPFS(nft.image);
      
      let displayPrice = "-";
      if (nft.price && !isNaN(parseFloat(nft.price)) && parseFloat(nft.price) > 0) {
        displayPrice = parseFloat(nft.price) + " APE";
      }

      const card = document.createElement("div");
      card.className = "nft-card";
      card.innerHTML = `
        <img src="${image}" alt="NFT" onerror="this.src='https://via.placeholder.com/300?text=Error'">
        <h4>${name}</h4>
        <p class="price">Qiymət: ${displayPrice}</p>
        <div class="nft-actions">
            <input type="number" min="0" step="0.01" class="price-input" placeholder="APE">
            <button class="wallet-btn buy-btn">Buy</button>
            <button class="wallet-btn list-btn" data-token="${tokenid}">List</button>
        </div>
      `;
      marketplaceDiv.appendChild(card);

      // BUY CLICK
      card.querySelector(".buy-btn").onclick = async () => await buyNFT(nft);
      
      // LIST CLICK
      card.querySelector(".list-btn").onclick = async (e) => {
        const rawTokenId = e.currentTarget.getAttribute("data-token");
        const priceInput = card.querySelector(".price-input");
        const priceStr = priceInput.value.trim();

        if (!rawTokenId) return notify("Xəta: Token ID yoxdur");
        if (!priceStr) return notify("Zəhmət olmasa qiymət yazın");

        let priceWei;
        try {
          priceWei = ethers.utils.parseEther(priceStr);
        } catch {
          return notify("Qiymət formatı yanlışdır");
        }
        await listNFT(rawTokenId, priceWei, card);
      };
    }
  } catch (err) {
    console.error("Load NFTs Error:", err);
  } finally {
    loadingNFTs = false;
  }
}

window.addEventListener("scroll", () => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 300) loadNFTs();
});

// ==========================================
// BUY FUNCTION (FIXED & OPTIMIZED)
// ==========================================

async function buyNFT(nftRecord) {
  if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");
  
  // 1. Check: Self-Purchase
  const buyerAddress = await signer.getAddress();
  if (nftRecord.buyer_address && nftRecord.buyer_address.toLowerCase() === buyerAddress.toLowerCase()) {
      return alert("Bu NFT artıq sizindir!");
  }
  // Alternativ sahə yoxlanışı (backend-dən asılı olaraq)
  if (nftRecord.seller_address && nftRecord.seller_address.toLowerCase() === buyerAddress.toLowerCase()) {
      return alert("Öz satışa qoyduğunuz NFT-ni ala bilməzsiniz.");
  }

  // 2. Check: Price
  if (!nftRecord.price || parseFloat(nftRecord.price) <= 0) {
    return alert("Bu NFT satışda deyil.");
  }

  notify("Alış hazırlanır...");
  
  // 3. Order Parsing
  let rawOrder = nftRecord.seaport_order ?? nftRecord.seaportOrderJSON;
  if (typeof rawOrder === "string") {
    try { rawOrder = JSON.parse(rawOrder); } 
    catch (e) { console.error("Order parse error", e); return alert("Order data xətası"); }
  }

  // Bəzən order obyektin içində olur
  if (rawOrder && rawOrder.order) rawOrder = rawOrder.order;

  // 4. Validation
  if (!rawOrder || !rawOrder.parameters || !rawOrder.signature) {
    console.error("Invalid Order Data:", rawOrder);
    return alert("Satış məlumatları natamamdır (Signature missing).");
  }

  try {
    // 5. Seaport Fulfill Order
    notify("Transaction qurulur...");

    // Seaport-dan action alırıq
    const { actions } = await seaport.fulfillOrder({ 
      order: rawOrder, 
      accountAddress: buyerAddress,
    });

    if (!actions || actions.length === 0) {
      throw new Error("Seaport heç bir əməliyyat qaytarmadı. Order ləğv edilmiş ola bilər.");
    }

    const action = actions[0]; // Adətən tək bir fulfill action olur

    // 6. Transaction Build (Manual Value Hesablama YOXDUR!)
    const txRequest = await action.transactionMethods.buildTransaction();

    // 7. Simulyasiya (CallStatic) - Xətanı əvvəlcədən tutmaq üçün
    try {
        await signer.call({
            to: txRequest.to,
            data: txRequest.data,
            value: txRequest.value
        });
    } catch (simError) {
        console.error("Simulation Error:", simError);
        const reason = simError.reason || simError.data?.message || simError.message;
        
        if (reason && reason.includes("insufficient funds")) {
             throw new Error("Balansınızda kifayət qədər APE yoxdur (Gas + NFT qiyməti).");
        } else {
             throw new Error("Simulyasiya xətası: " + reason);
        }
    }

    notify("Cüzdanda təsdiqləyin...");

    // 8. Transaction Göndərmə
    const tx = await signer.sendTransaction({
      to: txRequest.to,
      data: txRequest.data,
      value: txRequest.value, // Seaport-un hesabladığı dəqiq məbləğ
    });

    notify("Transaction göndərildi, gözləyin...");
    await tx.wait();
    
    notify("NFT uğurla alındı! 🎉");
    
    // 9. Backend Update
    const postPrice = nftRecord.price ? parseFloat(nftRecord.price) : 0;
    
    await fetch(`${BACKEND_URL}/api/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenid: nftRecord.tokenid,
        nft_contract: NFT_CONTRACT_ADDRESS,
        marketplace_contract: SEAPORT_CONTRACT_ADDRESS,
        buyer_address: buyerAddress,
        order_hash: nftRecord.order_hash,
        price: postPrice,
        on_chain: true,
      }),
    });

    // 10. UI Refresh
    setTimeout(() => { 
      loadedCount = 0; 
      allNFTs = []; 
      marketplaceDiv.innerHTML = ""; 
      loadNFTs(); 
    }, 2000);

  } catch (err) { 
    console.error("Buy Error:", err); 
    const reason = err.reason || err.data?.message || err.message || "Naməlum xəta";
    alert("Buy Xətası: " + reason); 
  }
}

// ==========================================
// LIST FUNCTION (FIXED & SAFE)
// ==========================================

async function listNFT(tokenid, priceWei, card) {
  if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");
  if (!tokenid) return alert("Token ID boşdur!");

  try {
    // 1. Chain Check (Çox vacib)
    const network = await provider.getNetwork();
    if (network.chainId !== APECHAIN_ID) {
        return alert("Səhv şəbəkə! Zəhmət olmasa ApeChain-ə qoşulun.");
    }

    const seller = await signer.getAddress();
    const tokenStr = tokenid.toString();

    // 2. Ownership & Approval Check
    const nftContract = new ethers.Contract(
      NFT_CONTRACT_ADDRESS,
      ["function ownerOf(uint256) view returns (address)", "function isApprovedForAll(address,address) view returns(bool)", "function setApprovalForAll(address,bool)"],
      signer
    );

    const owner = await nftContract.ownerOf(tokenStr);
    if (owner.toLowerCase() !== seller.toLowerCase()) return alert("Bu NFT sizə məxsus deyil!");

    const approved = await nftContract.isApprovedForAll(seller, SEAPORT_CONTRACT_ADDRESS);
    if (!approved) {
      notify("Marketplace üçün icazə verilir (Approve)...");
      const tx = await nftContract.setApprovalForAll(SEAPORT_CONTRACT_ADDRESS, true);
      await tx.wait();
    }

    notify("Satış orderi yaradılır (İmza tələb olunur)...");

    // 3. Create Order
    // OpenSea/Standard Seaport parametrləri
    const orderInput = {
      offer: [{ 
        itemType: 2, // ERC721
        token: NFT_CONTRACT_ADDRESS, 
        identifier: tokenStr 
      }],
      consideration: [{ 
        itemType: 0, // Native Token (APE)
        token: ZERO_ADDRESS, 
        identifier: "0", 
        amount: priceWei.toString(), 
        recipient: seller 
      }],
      // Start/End Time
      startTime: (Math.floor(Date.now() / 1000)).toString(),
      endTime: (Math.floor(Date.now() / 1000) + 30 * 86400).toString(), // 30 gün
      
      // Strict Parameters for Custom Marketplace
      conduitKey: ZERO_BYTES32, // No Conduit (Direct)
      zone: ZERO_ADDRESS,
      zoneHash: ZERO_BYTES32,
      restrictedByZone: false,
      salt: ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString() // Random salt
    };

    const create = await seaport.createOrder(orderInput, seller);
    if (!create || !create.executeAllActions) throw new Error("Seaport order yarada bilmədi");
    
    // İmza prosesi
    const signedOrder = await create.executeAllActions();
    
    // Hash və Safe JSON
    const orderHash = seaport.getOrderHash(signedOrder.parameters);
    const plainOrder = orderToJsonSafe(signedOrder);

    // 4. Backend-ə göndərmə
    await fetch(`${BACKEND_URL}/api/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenid: tokenStr,
        price: ethers.utils.formatEther(priceWei),
        nft_contract: NFT_CONTRACT_ADDRESS,
        marketplace_contract: SEAPORT_CONTRACT_ADDRESS,
        seller_address: seller.toLowerCase(),
        seaport_order: plainOrder,
        order_hash: orderHash,
        on_chain: false,
      }),
    });

    notify("NFT satışa qoyuldu! ✅");

    // UI Update
    card.querySelector(".price").textContent = "Qiymət: " + ethers.utils.formatEther(priceWei) + " APE";
    card.querySelector(".price-input").value = "";
    
    setTimeout(() => { 
      loadedCount = 0; 
      allNFTs = []; 
      marketplaceDiv.innerHTML = ""; 
      loadNFTs(); 
    }, 1500);

  } catch (err) { 
    console.error("List Error:", err); 
    alert("Listing Xətası: " + (err.message || "Bilinməyən xəta")); 
  }
}

// Funksiyaları qlobala atırıq (HTML onClick üçün)
window.connectWallet = connectWallet;
window.buyNFT = buyNFT;
window.listNFT = listNFT;
window.loadNFTs = loadNFTs;
