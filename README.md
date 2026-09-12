# FysiSteps 🌿 — Environmental Climate Action Platform

FysiSteps is a full-stack climate action application designed for community environmental initiatives (tree plantation drives, beach/river cleanups, waste segregation, and green habit tracking). The application features verified proof submissions, AI-assisted verification assessments, GreenPoints gamification, reward redemptions, community organizations, and an eco marketplace.

---

## 🗄️ Database Architecture: MongoDB Atlas Integration

FysiSteps uses **MongoDB Atlas** via **Mongoose** as its persistent production database layer. 

### Key Architectural Highlights
- **Full Model Coverage**: Dedicated Mongoose models for `User`, `Activity`, `Reward`, `Organization`, `Redemption`, `Order`, and `Event`.
- **String UUID Compatibility**: All models use UUID string identifiers (`_id: { type: String, default: () => randomUUID() }`) matching existing route parameters and client state.
- **Fail-Fast Safety**: Connection attempts use a 5-second timeout and `bufferCommands: false` to avoid hanging indefinitely if credentials or network rules are misconfigured.
- **Explicit Seeding**: Demo data is never automatically re-seeded on server startup; seeding is invoked explicitly via `npm run seed`.
- **Zero-Downtime Fallback**: For rapid local UI testing without active credentials, the server smoothly runs with development fallback storage until `MONGODB_URI` is provided.

---

## 🚀 Setting Up MongoDB Atlas

### 1. Create a Free MongoDB Atlas Cluster
1. Sign in or create an account at [MongoDB Atlas](https://cloud.mongodb.com/).
2. Create a new Project (e.g., `FysiSteps`).
3. Deploy a cluster: select the free **Shared M0** tier, choose your nearest cloud provider region (e.g., AWS Mumbai `ap-south-1`).

### 2. Configure Database Access (User Credentials)
1. Go to **Security** → **Database Access**.
2. Click **Add New Database User**.
3. Choose **Password** authentication method.
4. Set a username (e.g., `fysisteps_app`) and a secure password.
5. Under **Database User Privileges**, assign `Read and write to any database` (or specific database: `fysisteps`).
6. Click **Add User**.

### 3. Configure Network Access (IP Whitelist)
1. Go to **Security** → **Network Access**.
2. Click **Add IP Address**.
3. For serverless, containerized, or Cloud Run deployments, add `0.0.0.0/0` ("Allow Access From Anywhere").
4. For restricted environments, specify your exact server IP address.
5. Click **Confirm**.

### 4. Obtain Your Connection URI
1. In **Deployment** → **Database**, click **Connect**.
2. Choose **Drivers** (Node.js).
3. Copy the SRV connection string:
   ```
   mongodb+srv://<username>:<password>@<cluster-name>.mongodb.net/fysisteps?retryWrites=true&w=majority
   ```
4. Replace `<username>` and `<password>` with the credentials created in Step 2.

---

## ⚙️ Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set the required environment variables:

```env
# Required for persistent production storage:
MONGODB_URI=mongodb+srv://fysisteps_app:YourSecurePassword@cluster0.abcde.mongodb.net/fysisteps?retryWrites=true&w=majority

# Required for signing JWT tokens in production:
JWT_SECRET=your-strong-random-jwt-secret-key-32chars

# Optional platform administrative operations:
ADMIN_API_KEY=admin-secret-key

# Optional Gemini API key for server-side AI features:
GEMINI_API_KEY=
```

---

## 🔄 Data Migration & Seeding

### Migrating Existing `data.json` to MongoDB Atlas
To migrate historical data from `config/data.json` into MongoDB Atlas:
```bash
npm run migrate:data
```
The migration script:
- Verifies database connectivity.
- Imports all users, activities, organizations, rewards, orders, and redemptions.
- Skips existing documents to prevent duplicates.
- Preserves existing UUIDs and relational links.

### Seeding Demo Data
To populate the database with verified community demo records:
```bash
npm run seed
```
Demo records are tagged with `isDemo: true` and will not duplicate if already present.

---

## 💻 Running the Application

### Development Mode
```bash
npm run dev
```
The server will boot on port `3000` with live Vite frontend integration.

### Production Build & Start
```bash
npm run build
npm start
```

### Health Check Endpoint
Check system and database status at:
```http
GET /api/health
```
Example response:
```json
{
  "status": "ok",
  "service": "FysiSteps API",
  "database": "mongodb",
  "environment": "production"
}
```

---

## 🛡️ Authentication & Verification Architecture

- **Password Hashing**: Industry-standard `bcryptjs` (salt rounds: 10).
- **JWT Authorization**: Issued with 7-day expiration; validated via Express `Bearer` middleware.
- **AI-Assisted Verification**: Submissions are evaluated using multi-signal computer vision assessment (GPS coordinates, chromatic balance, category-specific visual checks, and before/after transformation deltas). Verification results are clearly identified as AI-assisted assessments.
