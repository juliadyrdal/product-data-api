import express from 'express';
import cors from 'cors';
import nodeFetch from 'node-fetch';
import createMetascraper from 'metascraper';
import metascraperImage from 'metascraper-image';
import metascraperTitle from 'metascraper-title';
import metascraperDescription from 'metascraper-description';
import { check, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import normalizeUrl from 'normalize-url';
import dotenv from 'dotenv';
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Create metascraper instance
const metascraper = createMetascraper([
  metascraperImage(),
  metascraperTitle(),
  metascraperDescription()
]);

// Allow requests from specified origin
app.use(cors({ origin: process.env.CORS_ORIGIN }));

// Max 100 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

// Apply rate limiter to /api/meta route
app.use('/api/meta', apiLimiter);

// Fetch metadata from a given URL
app.get('/api/meta', [
  // Validation middleware
  check('url')
    .exists().withMessage('URL parameter is required')
    .bail() // Stop running validations if previous ones failed
    .isURL().withMessage('Invalid URL format')
    .bail()
    .custom((value) => {
      // Only validate http and https
      const allowedProtocols = ['http:', 'https:'];
      const urlObj = new URL(value);
      if (!allowedProtocols.includes(urlObj.protocol)) {
        throw new Error('URL must use http or https protocol');
      }
      return true;
    })
], async (req, res) => {
  // Handle validation results
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // If validation errors exist, send a 400 response
    return res.status(400).json({ errors: errors.array() });
  }

  let { url } = req.query;

  // Sanitize the URL
  url = validator.trim(url);

  try {
    url = normalizeUrl(url, { forceHttps: true });
  } catch (err) {
    console.error('URL Normalization Error:', err.message);
    return res.status(400).json({ error: 'Invalid URL format after normalization' });
  }

  if (!validator.isURL(url, { require_protocol: true })) {
    return res.status(400).json({ error: 'Normalized URL is invalid' });
  }


  try {

    // Fetch the HTML content from the provided URL
    const response = await nodeFetch(url);
    
    // Check if the response is OK
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract metadata using metascraper
    const metadata = await metascraper({ html, url });

    // Respond with extracted metadata
    res.json(metadata);
  } catch (error) {
    // Log error
    console.error('Error fetching metadata:', error.message);

    // Send a 500 internal server error response
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

// Start the server and listen on the specified PORT
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
