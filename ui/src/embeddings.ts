// hardcoded for clip-vit-base-patch16
import { 
    CLIPVisionModel,
    AutoProcessor,
    RawImage 
  } from '@huggingface/transformers';
  
  interface GPU {
    requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  }
  
  //?
  interface GPURequestAdapterOptions {
    powerPreference?: 'low-power' | 'high-performance';
    forceFallbackAdapter?: boolean;
  }
  
  interface GPUAdapter {
    requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice | null>;
  }
  
  interface GPUDeviceDescriptor {
    label?: string;
  }
  
  interface GPUDevice {
    label: string;
  }
  
  declare global {
    interface Navigator {
      gpu?: GPU;
    }
  }

  type ProcessorType = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  type VisionModelType = Awaited<ReturnType<typeof CLIPVisionModel.from_pretrained>>;
  
  let visionModelInstance: VisionModelType | null = null;
  let processorInstance: ProcessorType | null = null;

  const MODEL_ID = "Xenova/clip-vit-base-patch16";
  const MODEL_CONFIG = {
    revision: "main",
    format: "onnx",
    quantized: false
  };
  
export const initializeModels = async () => {
    if (!visionModelInstance) {
      visionModelInstance = await CLIPVisionModel.from_pretrained(MODEL_ID, {
        ...MODEL_CONFIG,
        device: 'webgpu',
        progress_callback: (progress) => {
          console.log(`Loading model: ${progress}%`);
        }
      });
    }
    if (!processorInstance) {
      processorInstance = await AutoProcessor.from_pretrained(MODEL_ID, {
        ...MODEL_CONFIG,
        device: 'webgpu'
      });
    }
  };
  
  //const MODEL_ID = "openai/clip-vit-base-patch32";
  
  //type ProcessorType = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  //type VisionModelType = Awaited<ReturnType<typeof CLIPVisionModel.from_pretrained>>;
  
  //let visionModelInstance: VisionModelType | null = null;
  //let processorInstance: ProcessorType | null = null;
  
  //const initializeModels = async () => {
  //  if (!visionModelInstance) {
  //    visionModelInstance = await CLIPVisionModel.from_pretrained(MODEL_ID, {
  //      device: 'webgpu'
  //    });
  //  }
  //  if (!processorInstance) {
  //    processorInstance = await AutoProcessor.from_pretrained(MODEL_ID, {
  //      device: 'webgpu'
  //    });
  //  }
  //};
  
  const processImage = async (input: string | File | Blob): Promise<RawImage> => {
    if (typeof input === 'string') {
      if (input.startsWith('data:')) {
        const response = await fetch(input);
        const blob = await response.blob();
        return await RawImage.fromBlob(blob);
      } else {
        const response = await fetch(input);
        const blob = await response.blob();
        return await RawImage.fromBlob(blob);
      }
    } else {
      return await RawImage.fromBlob(input);
    }
  };
  
  export const getImageEmbeddings = async (input: string | File | Blob): Promise<number[]> => {
    console.log("[@UI/embeddings] Starting embedding computation");
    console.log("[@UI/embeddings] Input type:", typeof input);
    console.log("[@UI/embeddings] Input value:", input);

    if (!navigator.gpu) {
        throw new Error("WebGPU not supported in this browser.");
    }

    await initializeModels();
    console.log("[@UI/embeddings] Models initialized successfully");
    
    if (!visionModelInstance || !processorInstance) {
        throw new Error("Failed to initialize models");
    }

    console.log("[@UI/embeddings] Processing image...");
    const image = await processImage(input);
    console.log("[@UI/embeddings] Image processed successfully");

    console.log("[@UI/embeddings] Running through processor...");
    const processedImage = await processorInstance(image);
    console.log("[@UI/embeddings] Image processed through CLIP processor");

    console.log("[@UI/embeddings] Computing embeddings...");
    const { image_embeds } = await visionModelInstance(processedImage);
    console.log("[@UI/embeddings] Raw embeddings computed");
    
    console.log("[@UI/embeddings] Normalizing embeddings...");
    const normalizedEmbeds = image_embeds.normalize()
    const result = normalizedEmbeds.tolist();

    // Cleanup tensors
    image_embeds.dispose();
    normalizedEmbeds.dispose();

    console.log("[@UI/embeddings] Embedding computation complete");
    console.log("[@UI/embeddings] Embedding dimensions:", result[0].length);
    console.log("[@UI/embeddings] First few values:", result[0].slice(0, 5));
    return result[0];
  };
  
  export const disposeModels = async () => {
    if (visionModelInstance) {
      await visionModelInstance.dispose();
      visionModelInstance = null;
    }
    processorInstance = null;
  };