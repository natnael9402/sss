require("dotenv").config();
const express = require("express");
const multer = require("multer");
const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} = require("@google/generative-ai");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const MODEL_NAME = "gemini-1.5-pro";
const API_KEY = process.env.GOOGLE_API_KEY;

app.set("view engine", "ejs");
app.set("views", `${__dirname}/views`);
app.use(express.static(`${__dirname}/public`));

app.get("/", (req, res) => {
    res.render("index", { carInfo: null });
});

app.post("/upload", upload.single("image"), async (req, res) => {
    const imageBuffer = req.file ? req.file.buffer : null;
    if (!imageBuffer) {
        return res.status(400).json({ error: "No image file provided" });
    }

    try {
        const carInfoJson = await getCarInfo(imageBuffer);
        console.log("Server response:", carInfoJson);
        const carInfo = JSON.parse(carInfoJson);
        if (carInfo.error) {
            res.status(400).json({ error: carInfo.error });
        } else {
            carInfo.imageBase64 = imageBuffer.toString("base64");
            res.json({ carInfo });
        }
    } catch (error) {
        console.error("Error:", error);
        if (error.name === "GoogleGenerativeAIFetchError") {
            console.error("Google API Error:", error);
            res.status(500).json({
                error: "A server error occurred at Google's API. Please retry later.",
            });
        } else {
            res.status(500).json({
                error: "An unexpected error occurred on the server.",
            });
        }
    }
});

const getCarInfo = async (imageBuffer) => {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const generationConfig = {
        temperature: 0.9,
        topK: 32,
        topP: 0.95,
        maxOutputTokens: 1024,
    };

    const safetySettings = [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
    ];

    const parts = [
        {
            text: `Accurately identify the vehicle model, manufacturer, color, and year with your analysis. Please respond in the following JSON format:
    
          {
            "vehicle": {
              "manufacturer": "string",
              "model": "string",
              "color": "string",
              "year": "string",
              "logo": { "image": "image_data" },
              "fuel_type": "string",
              "fuel_efficiency_kmpl": "number",
              "max_speed_kmph": "number",
              "manufacturer_country": "string",
              "years_of_production": "string",
              "horsepower": "number"
            }
          }
    
          The "logo" field should contain an actual image of the manufacturer's logo, not a URL.
    
          If the image does not contain a vehicle, respond in this format:
          {
            "error": "The image does not contain a vehicle."
          }
    
          Example responses:
    
          For a successful identification:
          {
            "vehicle": {
              "manufacturer": "Toyota",
              "model": "Camry",
              "color": "White",
              "year": "2020",
              "logo": { "image": "actual_logo_image_data" },
              "fuel_type": "Petrol",
              "fuel_efficiency_kmpl": 14,
              "max_speed_kmph": 210,
              "manufacturer_country": "Japan",
              "years_of_production": "2018-2023",
              "horsepower": 203
            }
          }
    
          If the vehicle's year cannot be exactly determined, provide the range in the format "YYYY-YYYY" (e.g., "2002-2006"). Example:
          {
            "vehicle": {
              "manufacturer": "Honda",
              "model": "Civic",
              "color": "Black",
              "year": "2002-2006",
              "logo": { "image": "actual_logo_image_data" },
              "fuel_type": "Petrol",
              "fuel_efficiency_kmpl": 16,
              "max_speed_kmph": 220,
              "manufacturer_country": "Japan",
              "years_of_production": "2001-2006",
              "horsepower": 158
            }
          }`
        },
        {
            inlineData: {
                mimeType: "image/jpeg",
                data: imageBuffer.toString("base64"),
            },
        },
    ];
    ;

    const result = await model.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig,
        safetySettings,
    });

    const response = result.response;
    return response
        .text()
        .replace(/```json/g, "")
        .replace(/```/g, "");
};

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`App is running on port ${port}`);
});
