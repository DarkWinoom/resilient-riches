import { onScopeDispose, ref } from 'vue';
import type { ShareModel } from '../utils/share-model.ts';
import { shareFilename } from '../utils/share-model.ts';
import { renderShareSvg } from '../utils/share-svg.ts';

export function useReportExport() {
  const exporting = ref(false),
    error = ref(''),
    success = ref(false);
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
  });
  async function save(model: ShareModel) {
    if (exporting.value) return;
    exporting.value = true;
    error.value = '';
    success.value = false;
    let svgUrl: string | undefined, downloadUrl: string | undefined;
    try {
      await document.fonts.ready;
      if (disposed) return;
      const { svg, width, height } = renderShareSvg(model);
      const scale = Math.min(2, Math.sqrt(24000000 / (width * height)), 16000 / height);
      if (scale < 0.5) throw new Error('分类过多，暂时无法生成清晰长图，请选择隐藏分类后再保存。');
      svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();
      image.src = svgUrl;
      await image.decode();
      if (disposed) return;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法创建图片画布，请重试。');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('图片生成失败，请重试。'))),
          'image/png',
        ),
      );
      if (disposed) return;
      downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = shareFilename(model);
      document.body.append(link);
      link.click();
      link.remove();
      success.value = true;
      const completedUrl = downloadUrl;
      setTimeout(() => URL.revokeObjectURL(completedUrl), 10000);
      downloadUrl = undefined;
    } catch (failure) {
      if (!disposed)
        error.value =
          failure instanceof Error && /^(分类过多|浏览器无法|图片生成)/.test(failure.message)
            ? failure.message
            : '图片保存失败，请重试。';
    } finally {
      if (svgUrl) URL.revokeObjectURL(svgUrl);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      if (!disposed) exporting.value = false;
    }
  }
  return { exporting, error, success, save };
}
