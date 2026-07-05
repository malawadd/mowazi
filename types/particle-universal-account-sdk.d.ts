declare module "@particle-network/universal-account-sdk" {
  export enum CHAIN_ID {
    ARBITRUM_MAINNET_ONE = 42161,
    OPTIMISM_MAINNET = 10,
  }

  export const ZeroAddress: string;
  export const UNIVERSAL_ACCOUNT_VERSION: string;

  export type UniversalAccountToken = {
    chainId: number;
    address: string;
  };

  export type ITransferTransaction = {
    token: UniversalAccountToken;
    amount: string;
    receiver: string;
  };

  export type IAssetsResponse = {
    totalAmountInUSD: number;
    assets: Array<{
      tokenType: string;
      amount: number;
      amountInUSD: number;
    }>;
  };

  export type ITransaction = {
    rootHash: string;
    transactionId: string;
  };

  export type UniversalAccountConfig = {
    projectId: string;
    projectClientKey: string;
    projectAppUuid: string;
    smartAccountOptions?: {
      useEIP7702?: boolean;
      name: string;
      version: string;
      ownerAddress: string;
    };
    tradeConfig?: {
      slippageBps?: number;
      universalGas?: boolean;
    };
  };

  export class UniversalAccount {
    constructor(config: UniversalAccountConfig);
    getSmartAccountOptions(): Promise<{
      ownerAddress?: string;
      smartAccountAddress?: string;
      solanaSmartAccountAddress?: string;
    }>;
    getPrimaryAssets(): Promise<IAssetsResponse>;
    createTransferTransaction(input: ITransferTransaction): Promise<ITransaction>;
    sendTransaction(transaction: ITransaction, signature: string): Promise<{ transactionId: string }>;
  }
}
