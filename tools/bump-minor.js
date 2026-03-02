const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const packageLockPath = path.join(rootDir, 'package-lock.json');
const versionMetaPath = path.join(rootDir, 'Scripts', 'meta', 'version.json');
const releaseNotesPath = path.join(rootDir, 'Scripts', 'release-notes.json');

function readJson(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function parseSemver(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || '').trim());
    if (!match) {
        throw new Error(`Version invalide: "${version}" (attendu: x.y.z)`);
    }
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3])
    };
}

function computeNextMinorVersion(version) {
    const parsed = parseSemver(version);
    return `${parsed.major}.${parsed.minor + 1}.0`;
}

function getArgValue(flagName) {
    const arg = process.argv.find((item) => item.startsWith(`${flagName}=`));
    if (!arg) return '';
    return arg.slice(flagName.length + 1).trim();
}

function getArgValues(flagName) {
    const prefix = `${flagName}=`;
    return process.argv
        .filter((item) => item.startsWith(prefix))
        .map((item) => item.slice(prefix.length).trim())
        .filter(Boolean);
}

function run() {
    const packageJson = readJson(packageJsonPath);
    const currentVersion = packageJson.version;
    const nextVersion = computeNextMinorVersion(currentVersion);
    const releaseDate = getArgValue('--date') || new Date().toISOString().slice(0, 10);
    const releaseTitle = getArgValue('--title') || `Minor release ${nextVersion}`;
    const releaseChanges = getArgValues('--change');

    packageJson.version = nextVersion;
    writeJson(packageJsonPath, packageJson);

    if (fs.existsSync(packageLockPath)) {
        const packageLock = readJson(packageLockPath);
        packageLock.version = nextVersion;
        if (packageLock.packages && packageLock.packages['']) {
            packageLock.packages[''].version = nextVersion;
        }
        writeJson(packageLockPath, packageLock);
    }

    const versionMeta = fs.existsSync(versionMetaPath) ? readJson(versionMetaPath) : {};
    versionMeta.version = nextVersion;
    versionMeta.releasedAt = releaseDate;
    if (!versionMeta.channel) {
        versionMeta.channel = 'stable';
    }
    writeJson(versionMetaPath, versionMeta);

    const releaseNotes = fs.existsSync(releaseNotesPath)
        ? readJson(releaseNotesPath)
        : { releases: [] };

    if (!Array.isArray(releaseNotes.releases)) {
        releaseNotes.releases = [];
    }

    releaseNotes.releases.unshift({
        version: nextVersion,
        date: releaseDate,
        title: releaseTitle,
        changes: releaseChanges.length
            ? releaseChanges
            : ['Release mineure creee automatiquement. Completer les changements.']
    });
    writeJson(releaseNotesPath, releaseNotes);

    console.log(`Version mineure incrementee: ${currentVersion} -> ${nextVersion}`);
    console.log(`Date: ${releaseDate}`);
    console.log(`Titre: ${releaseTitle}`);
}

run();
