const { asArray } = require('../../normalizers/toolResult');
const { formatToolErrorMessage } = require('./shared');
const {
  getConfiguredEtherscanChains,
  tokenAmountFromRaw,
  getEtherscan,
  getEtherscanResult,
  findOpenOceanPrice,
  getNativePriceFromMap,
  getNativePriceMap,
  getOpenOceanBalances
} = require('./etherscanClient');

async function getWalletHoldings(args = {}) {
    const address = String(args.address || '').trim();
    if (!address) throw new Error('Wallet address is required for get_wallet_holdings.');

    const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
    if (!ETHERSCAN_API_KEY) throw new Error('ETHERSCAN_API_KEY is not configured in the backend environment.');

    const chains = getConfiguredEtherscanChains();
    const nativePriceMap = await getNativePriceMap(chains);
    const tokens = [];
    const chainSummaries = [];
    const tokenTransferOffset = Math.min(Math.max(Number(process.env.ETHERSCAN_TOKEN_TRANSFER_OFFSET) || 100, 1), 1000);
    const tokensPerChain = Math.min(Math.max(Number(process.env.ETHERSCAN_TOKENS_PER_CHAIN) || 12, 1), 50);

    const chainPromises = chains.map(async (chain) => {
      const summary = {
        chainId: chain.chainId,
        chain: chain.name,
        nativeSymbol: chain.nativeSymbol,
        status: 'success',
        nativeBalance: 0,
        tokenContractsChecked: 0,
        valuedTokenCount: 0,
        totalValueUsd: 0,
        errors: []
      };

      const chainTokens = [];

      try {
        const ooPrices = await getOpenOceanBalances(chain.chainId, address);
        const balanceRes = await getEtherscan({
          chainid: chain.chainId,
          module: 'account',
          action: 'balance',
          address,
          tag: 'latest',
          apikey: ETHERSCAN_API_KEY
        });
        const nativeBalanceRaw = getEtherscanResult(balanceRes.data);
        const nativeBalance = tokenAmountFromRaw(nativeBalanceRaw, 18);
        summary.nativeBalance = nativeBalance;

        const openOceanNativePrice = findOpenOceanPrice(ooPrices, chain.priceSymbols || chain.nativeSymbol);
        const fallbackNativePrice = getNativePriceFromMap(nativePriceMap, chain);
        const nativePrice = openOceanNativePrice || fallbackNativePrice;
        const nativeValue = nativeBalance * nativePrice;
        if (nativeBalance > 0) {
          chainTokens.push({
            symbol: chain.nativeSymbol,
            name: chain.nativeName,
            balance: nativeBalance,
            usdPrice: nativePrice,
            usdValue: nativeValue,
            priceSource: openOceanNativePrice ? 'OpenOcean' : fallbackNativePrice ? 'CoinGecko' : null,
            chain: chain.name,
            chainId: chain.chainId,
            contract: null,
            native: true
          });
          summary.valuedTokenCount += nativeValue > 0 ? 1 : 0;
          summary.totalValueUsd += nativeValue;
        }

        let transfers = [];
        try {
          const transferRes = await getEtherscan({
            chainid: chain.chainId,
            module: 'account',
            action: 'tokentx',
            address,
            page: 1,
            offset: tokenTransferOffset,
            sort: 'desc',
            apikey: ETHERSCAN_API_KEY
          });
          transfers = asArray(getEtherscanResult(transferRes.data));
        } catch (error) {
          summary.status = 'partial';
          summary.errors.push(`ERC-20 discovery failed: ${formatToolErrorMessage(error, 'Etherscan')}`);
        }

        const uniqueTokens = new Map();
        for (const tx of transfers) {
          const contract = String(tx.contractAddress || '').toLowerCase();
          if (contract && !uniqueTokens.has(contract)) {
            uniqueTokens.set(contract, {
              symbol: tx.tokenSymbol,
              name: tx.tokenName,
              decimals: Number(tx.tokenDecimal),
              contract
            });
          }
        }

        const tokenBalances = [];
        for (const token of Array.from(uniqueTokens.values()).slice(0, tokensPerChain)) {
          try {
            const tokenBalanceRes = await getEtherscan({
              chainid: chain.chainId,
              module: 'account',
              action: 'tokenbalance',
              contractaddress: token.contract,
              address,
              tag: 'latest',
              apikey: ETHERSCAN_API_KEY
            });
            const rawBalance = getEtherscanResult(tokenBalanceRes.data);
            tokenBalances.push({
              ...token,
              balance: tokenAmountFromRaw(rawBalance, token.decimals)
            });
          } catch (error) {
            summary.errors.push(`${token.symbol || token.contract} balance failed: ${formatToolErrorMessage(error, 'Etherscan')}`);
            tokenBalances.push(null);
          }
        }

        summary.tokenContractsChecked = tokenBalances.length;
        tokenBalances.filter((token) => token && token.balance > 0).forEach((token) => {
          const price = findOpenOceanPrice(ooPrices, token.symbol, token.contract);
          const usdValue = token.balance * price;
          chainTokens.push({
            ...token,
            usdPrice: price,
            usdValue,
            priceSource: price > 0 ? 'OpenOcean' : null,
            chain: chain.name,
            chainId: chain.chainId
          });
          summary.valuedTokenCount += usdValue > 0 ? 1 : 0;
          summary.totalValueUsd += usdValue;
        });
      } catch (error) {
        summary.status = 'error';
        summary.errors.push(formatToolErrorMessage(error, 'Etherscan'));
      }

      summary.totalValueUsd = Number(summary.totalValueUsd.toFixed(2));
      return { summary, chainTokens };
    });

    const results = await Promise.all(chainPromises);
    for (const result of results) {
      chainSummaries.push(result.summary);
      tokens.push(...result.chainTokens);
    }

    tokens.sort((a, b) => b.usdValue - a.usdValue);
    const totalValueUsd = tokens.reduce((sum, token) => sum + (Number(token.usdValue) || 0), 0);
    const successfulChains = chainSummaries.filter((chain) => chain.status === 'success' || chain.status === 'partial');
    const failedChains = chainSummaries.filter((chain) => chain.status === 'error');

    if (!successfulChains.length) {
      const message = failedChains[0]?.errors?.[0] || 'No Etherscan chains could be scanned.';
      throw new Error(message);
    }

    return {
      address,
      tokens: tokens.slice(0, 30),
      totalValueUsd: totalValueUsd.toFixed(2),
      source: 'Etherscan V2 + OpenOcean/CoinGecko pricing',
      chainsScanned: successfulChains.map((chain) => chain.chain),
      chainIdsScanned: successfulChains.map((chain) => chain.chainId),
      chainsAttempted: chainSummaries.map((chain) => chain.chain),
      chainSummaries,
      chainCoverage: {
        attempted: chainSummaries.length,
        successful: successfulChains.length,
        failed: failedChains.length,
        failedChains: failedChains.map((chain) => chain.chain)
      },
      caveats: [
        'ERC-20 discovery uses recent token transfers plus tokenbalance lookups for free-tier compatibility.',
        'Etherscan direct address token holding is a PRO endpoint; tokens without recent transfer history may be missed.',
        'Native coin pricing falls back to CoinGecko simple price when OpenOcean wallet balances do not include a usable USD price.',
        'ERC-20 USD pricing is best effort from OpenOcean and may be unavailable for some tokens or chains.'
      ]
    };
}

module.exports = { getWalletHoldings };
