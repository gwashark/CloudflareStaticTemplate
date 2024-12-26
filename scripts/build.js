const fs = require("fs");
const path = require("path");
const { minify: minifyHtml } = require("html-minifier");
const CleanCSS = require("clean-css");
const UglifyJS = require("uglify-js");
const sharp = require("sharp");

const inputDir = process.argv[2];
const outputDir = process.argv[3];

if (!inputDir || !outputDir) {
  console.error("Usage: node minify.js <inputDir> <outputDir>");
  process.exit(1);
}

if (!fs.existsSync(inputDir)) {
  console.error(`Input directory ${inputDir} does not exist`);
  process.exit(1);
}

if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true });
}

async function optimizeImage(inputPath, outputPath) {
  try {
    console.log(`Optimizing image ${inputPath}...`);
    await sharp(inputPath)
      .webp({ quality: 80 })
      .toFile(outputPath.replace(/\.(jpg|jpeg|png)$/i, ".webp"));
    return path.basename(outputPath).replace(/\.(jpg|jpeg|png)$/i, ".webp");
  } catch (error) {
    console.error(`Error optimizing image ${inputPath}:`, error);
    return null;
  }
}

function updateImageReferences(content, oldPath, newPath) {
  const regex = new RegExp(oldPath, "g");
  return content.replace(regex, newPath);
}

async function minifyFile(filePath, outputFilePath, imageMap) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    let content = fs.readFileSync(filePath, "utf8");
    let minifiedContent;

    console.log(`Minifying file ${filePath}...`);
    switch (ext) {
      case ".html":
        for (const [oldPath, newPath] of Object.entries(imageMap)) {
          content = updateImageReferences(content, oldPath, newPath);
        }
        minifiedContent = minifyHtml(content, {
          removeComments: true,
          collapseWhitespace: true,
          minifyJS: true,
          minifyCSS: true,
        });
        break;
      case ".css":
        for (const [oldPath, newPath] of Object.entries(imageMap)) {
          content = updateImageReferences(content, oldPath, newPath);
        }
        minifiedContent = new CleanCSS().minify(content).styles;
        break;
      case ".js":
        minifiedContent = UglifyJS.minify(content).code;
        break;
      case ".jpg":
      case ".jpeg":
      case ".png":
        const newFileName = await optimizeImage(filePath, outputFilePath);
        if (newFileName) {
          imageMap[path.basename(filePath)] = newFileName;
        }
        return;
      default:
        fs.copyFileSync(filePath, outputFilePath);
        return;
    }

    fs.writeFileSync(outputFilePath, minifiedContent, "utf8");
  } catch (error) {
    console.error(`Error minifying file ${filePath}:`, error);
  }
}

async function minifyFolder(inputDir, outputDir) {
    try {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        console.log(`Processing folder ${inputDir}...`);
        const imageMap = {};
        const files = fs.readdirSync(inputDir);

        const imagePromises = files.map(async (file) => {
            const inputFilePath = path.join(inputDir, file);
            const outputFilePath = path.join(outputDir, file);
            const ext = path.extname(file).toLowerCase();

            if ([".jpg", ".jpeg", ".png"].includes(ext)) {
                await minifyFile(inputFilePath, outputFilePath, imageMap);
            }
        });

        await Promise.all(imagePromises);

        const otherFilePromises = files.map(async (file) => {
            const inputFilePath = path.join(inputDir, file);
            const outputFilePath = path.join(outputDir, file);
            const ext = path.extname(file).toLowerCase();

            if (![".jpg", ".jpeg", ".png"].includes(ext)) {
                if (fs.lstatSync(inputFilePath).isDirectory()) {
                    await minifyFolder(inputFilePath, outputFilePath);
                } else {
                    await minifyFile(inputFilePath, outputFilePath, imageMap);
                }
            }
        });

        await Promise.all(otherFilePromises);
    } catch (error) {
        console.error(`Error processing folder ${inputDir}:`, error);
        process.exit(1);
    }
}

console.log("Building Site...");
(async () => {
    await minifyFolder(inputDir, outputDir);
    console.log("Site Built Successfully!");
})();