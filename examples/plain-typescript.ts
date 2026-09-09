import {
  BrotherPrint,
  searchBrotherPrinters,
  BRLMPrinterModelName,
  BRLMPrinterPort,
  BRLMPrinterLabelName,
  type BRLMChannelResult,
} from '@rdlabo/capacitor-brotherprint';

export async function printLabel(
  encodedImage: string,
  select: (channels: readonly BRLMChannelResult[]) => Promise<BRLMChannelResult | null>,
): Promise<void> {
  const model = BRLMPrinterModelName.QL_820NWB;
  const printers = await searchBrotherPrinters({ port: BRLMPrinterPort.wifi, searchDuration: 10 }, model);
  const channel = printers.length === 1 ? printers[0] : printers.length > 1 ? await select(printers) : null;
  if (!channel) return;
  await BrotherPrint.printImage({
    modelName: model,
    encodedImage,
    labelName: BRLMPrinterLabelName.RollW62,
    port: channel.port,
    channelInfo: channel.channelInfo,
  });
}
