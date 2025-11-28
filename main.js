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

// Seaport 1.5 Canonical Address
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
    
    // Chain dəyişəndə error verməməsi üçün 'any'
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    
    await provider.send("eth_requestAccounts", []);
    const network = await provider.getNetwork();

    // ApeChain Check
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
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        notify("Şəbəkə dəyişdirildi. Gözləyin...");
      } catch (e) {
        console.error("Network switch error:", e);
        return alert("ApeChain şəbəkəsinə keçilmədi.");
      }
    }

    signer = provider.getSigner();
    userAddress = (await signer.getAddress()).toLowerCase();

    // Seaport Init
    seaport = new Seaport(signer, { overrides: { contractAddress: SEAPORT_CONTRACT_ADDRESS } });
    
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

      card.querySelector(".buy-btn").onclick = async () => await buyNFT(nft);
      
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
// BUY FUNCTION (SMART GAS & APPROVAL CHECK)
// ==========================================

async function buyNFT(nftRecord) {
  if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");
  
  try {
    const buyerAddress = await signer.getAddress();
    
    // 1. Öz-özünə satışın qarşısını al
    if (nftRecord.seller_address && nftRecord.seller_address.toLowerCase() === buyerAddress.toLowerCase()) {
        return alert("Öz satışa qoyduğunuz NFT-ni ala bilməzsiniz.");
    }
    
    if (!nftRecord.price || parseFloat(nftRecord.price) <= 0) {
      return alert("Bu NFT satışda deyil.");
    }

    notify("Order yoxlanılır...");

    // 2. Order Parsing
    let rawOrder = nftRecord.seaport_order ?? nftRecord.seaportOrderJSON;
    if (typeof rawOrder === "string") {
      try { rawOrder = JSON.parse(rawOrder); } 
      catch (e) { console.error("Order parse error", e); return alert("Order data xətası"); }
    }
    if (rawOrder && rawOrder.order) rawOrder = rawOrder.order;

    if (!rawOrder || !rawOrder.parameters || !rawOrder.signature) {
      return alert("Satış məlumatları natamamdır (Signature missing).");
    }

    // ======================================================
    // 3. CHECK: Satıcının İcazəsi (Approval)
    // ======================================================
    const sellerFromOrder = rawOrder.parameters.offerer;
    
    const nftReadContract = new ethers.Contract(
        NFT_CONTRACT_ADDRESS,
        ["function isApprovedForAll(address, address) view returns (bool)"],
        provider
    );

    const isApproved = await nftReadContract.isApprovedForAll(sellerFromOrder, SEAPORT_CONTRACT_ADDRESS);
    
    if (!isApproved) {
        console.error(`Satıcı (${sellerFromOrder}) Seaport üçün approval verməyib.`);
        return alert(`XƏTA: NFT sahibi (${sellerFromOrder.slice(0,6)}...) satış icazəsini ləğv edib.`);
    }

    // ======================================================
    // 4. Fulfillment & Gas Estimation
    // ======================================================
    notify("Tranzaksiya hazırlanır...");

    const { actions } = await seaport.fulfillOrder({ 
      order: rawOrder, 
      accountAddress: buyerAddress,
    });

    if (!actions || actions.length === 0) {
      throw new Error("Seaport heç bir əməliyyat qaytarmadı.");
    }

    const action = actions[0];
    const txRequest = await action.transactionMethods.buildTransaction();

    // 5. Simulyasiya (Revert Check)
    try {
        await provider.call({
            ...txRequest,
            from: buyerAddress,
            gasLimit: 6000000 // Yalnız simulyasiya üçün yüksək limit
        });
        console.log("Simulyasiya Uğurlu ✅");
    } catch (simError) {
        console.warn("Simulyasiya Xətası:", simError);
        const proceed = confirm(
             "DİQQƏT: Simulyasiya xəta verdi (RPC gecikməsi ola bilər).\n\n" + 
             "Yenə də almaq istəyirsiniz?"
        );
        if (!proceed) return notify("Əməliyyat ləğv edildi.");
    }

    notify("Gas hesablanır...");

    // 6. Smart Gas Estimation
    let estimatedGas;
    try {
        const gasEstimate = await signer.estimateGas({
            to: txRequest.to,
            data: txRequest.data,
            value: txRequest.value
        });
        // 20% ehtiyat (Buffer)
        estimatedGas = gasEstimate.mul(120).div(100); 
    } catch (error) {
        console.warn("Gas estimate failed, using Safe Limit");
        // Hesablama alınmasa, təhlükəsiz limit (500k)
        estimatedGas = ethers.BigNumber.from("500000"); 
    }

    notify("Cüzdanda təsdiqləyin...");

    // 7. Transaction Send (Dynamic Gas)
    const tx = await signer.sendTransaction({
      to: txRequest.to,
      data: txRequest.data,
      value: txRequest.value,
      gasLimit: estimatedGas
    });

    notify("Transaction göndərildi, gözləyin...");
    await tx.wait();
    
    notify("NFT uğurla alındı! 🎉");
    
    // 8. Backend Update
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

    // 9. UI Yenilə
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
// LIST FUNCTION (TIMESTAMP FIX: -5 MIN)
// ==========================================

async function listNFT(tokenid, priceWei, card) {
  if (!signer || !seaport) return alert("Cüzdan qoşulmayıb!");
  if (!tokenid) return alert("Token ID boşdur!");

  try {
    // 1. Chain Check
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
      notify("İcazə verildi.");
    }

    notify("Satış imzası yaradılır...");

    // 3. Create Order
    const orderInput = {
      offer: [{ 
        itemType: 2, // ERC721
        token: NFT_CONTRACT_ADDRESS, 
        identifier: tokenStr 
      }],
      consideration: [{ 
        itemType: 0, // Native APE
        token: ZERO_ADDRESS, 
        identifier: "0", 
        amount: priceWei.toString(), 
        recipient: seller 
      }],
      // *** TIMESTAMP FIX: 5 Dəqiqə Geriyə ***
      startTime: (Math.floor(Date.now() / 1000) - 300).toString(),
      endTime: (Math.floor(Date.now() / 1000) + 30 * 86400).toString(),
      
      conduitKey: ZERO_BYTES32, // Direct
      zone: ZERO_ADDRESS,
      zoneHash: ZERO_BYTES32,
      restrictedByZone: false,
      salt: ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString()
    };

    const create = await seaport.createOrder(orderInput, seller);
    if (!create || !create.executeAllActions) throw new Error("Seaport order xətası");
    
    const signedOrder = await create.executeAllActions();
    const orderHash = seaport.getOrderHash(signedOrder.parameters);
    const plainOrder = orderToJsonSafe(signedOrder);

    // 4. Backend Update
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

window.connectWallet = connectWallet;
window.buyNFT = buyNFT;
window.listNFT = listNFT;
window.loadNFTs = loadNFTs;
