"use strict";

// webgl related
let gl;
let programFirefly;
let cBufferFirefly;
let vBufferFirefly;
let colorLocFirefly;
let positionLocFirefly;
let transposeFireflyLoc;
let projectionFireflyLoc;

let programGlow;
// let cBufferGlow; // no longer use, switch to uniform variable colorGlow
let vBufferGlow;
// let colorLocGlow; // no longer use, switch to uniform variable colorGlow
let positionLocGlow;
let transposeGlowLoc;
let colorGlowLoc;
let alphaGlowLoc;
let scaleGlowLoc;
let projectionGlowLoc;

let positionsFirefly = []; // firefly model positions
let colorsFirefly = []; // firefly model colors
let translationFirefly = []; // firefly positions of world frame
let rotationFirefly = []; // firefly rotation of self frame
let clockFirefly = []; // firefly glowing clock, [0, 1]

let positionsGlow = []; // glow model positions
// let colorsGlow = []; // glow model colors // no longer use, switch to uniform variable colorGlow
let translationGlow = []; // glow positions of world frame, the same as firefly ones
let rotationGlow = []; // glow rotation of self frame, the same as firefly ones
let clockGlow = []; // glow glowing clock, [0, 1]
let flagGlow = []; // glow flag, ture: glowing, false: not glowing


// config related
const frameSpeedMS = 17;
const sizeFirefly = 0.02;
const colorGlowSaturation = 1;
const colorGlowLightness = 0.6;

let numFirefly = 256;

let colorGlowHue = 60;
let colorGlow = hslToRgb(colorGlowHue / 360, colorGlowSaturation, colorGlowLightness);

let glowSizeFactor = 100;
let glowSize = glowSizeFactor / 100;

let glowFrequencyFactor = 8;
let clockFireflySpeed = glowFrequencyFactor / 1000;

let nudgeRangeFactor = 32;
let nudgeSpeedFactor = 8;

let projectionMat = mat4();
let cameraRotation = vec3(0, 0, 0);
let perspectiveFlag = false;
let cameraMat = mat4();
let fov = 90;


let resetFlag = false;


//
// tool functions
//

// translate color space: HSL => RGB
// (float[0, 1], float[0, 1], float[0, 1]) => (float[0, 1], float[0, 1], float[0, 1])
function hslToRgb(h, s, l){
    let r, g, b;

    if(s == 0){
        r = g = b = l; // achromatic
    } else {
        let hue2rgb = function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        let p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    };
    return [r, g, b];
}


// compute homogeneous rotation matrix
// vec3(roll, pitch, yaw) => mat4
function getRotationMat(tempRotation) {
	const zMat = rotateZ(tempRotation[2]);
	const yMat = rotateY(tempRotation[1]);
	const xMat = rotateX(tempRotation[0]);
	return mult(xMat, mult(yMat, zMat));
};

// compute homogeneous transpose matrix
// (vec3(roll, pitch, yaw), vec3(x, y, z)) => mat4
function getTransposeMat(tempRotation, tempTranslation) {
	const tMat = translate(tempTranslation[0], tempTranslation[1], tempTranslation[2]);
	const rMat = getRotationMat(tempRotation)
	return mult(tMat, rMat);
};

// compute the distance between two vector
// (vec, vec) => float[0, inf)
function getDistance(posA, posB) {
	return length(subtract(posA, posB));
};

// add a random rotation to tempRotation
// (vec3(roll, pitch, yaw), float(0, 45)) => vec3(roll, pitch, yaw)
function randomRotate(tempRotation, rotationSpeed) {
	let [tempRow, tempPitch, tempYaw] = tempRotation;
	const rotationSpeed2 = rotationSpeed * 2;
	const randomIdx = Math.random();
	if (randomIdx < 0.5) {
		tempYaw = (tempYaw + 360 + Math.random() * rotationSpeed2 - rotationSpeed) % 360;
	} else if (randomIdx < 0.85) {
		tempPitch = (tempPitch + 450 + Math.random() * rotationSpeed2 - rotationSpeed) % 360 - 90;
	} else {
		tempRow = (tempRow + 450 + Math.random() * rotationSpeed2 - rotationSpeed) % 360 - 90;
	};
	return vec3(tempRow, tempPitch, tempYaw);
};


// add a random translation to tempTranslation, given tempRotation
// (vec3(x, y, z), vec3(roll, pitch, yaw), float(0, 0.1)) => vec3(x, y, z)
function randomTranslate(tempTranslation, tempRotation, translationSpeed) {
	const rMat = getRotationMat(tempRotation);
	const unitVec = vec4(translationSpeed, 0, 0, 0); // becasue the model of firefly is heading to x+
	const rotatedUniVec = mult(rMat, unitVec);
	const translationDiff = vec3(rotatedUniVec[0], rotatedUniVec[1], rotatedUniVec[2]);
	return add(tempTranslation, translationDiff);
};

// construct a sphere with radius r, where latitude splits into lSize, and longitude splits into bSize + 2
// (float(0, inf), int[3, inf), int[1, inf)) => Array(vec3(x, y, z))
function getSphere(r, lSize, bSize) {
	let positionSphere = [];

	const longitudeAngleList = Array.from({length: lSize}, (x, i) => 2 * Math.PI * (i / lSize));
	const latitudeAngleList = Array.from({length: bSize}, (x, i) => Math.PI / 2 * ((0.5 + i) / (bSize / 2) - 1));
	let prevCircle = new Array(lSize + 1).fill(vec3(0, 0, r));
	let tempCircle = new Array(lSize + 1);
	for (let lIdx = latitudeAngleList.length - 1; lIdx >= 0; lIdx --) {
		const l = latitudeAngleList[lIdx];
		const z = r * Math.sin(l);
		const p = r * Math.cos(l); // projection of r on xy plane
		for (let bIdx = longitudeAngleList.length - 1; bIdx >= 0; bIdx --) {
			const b = longitudeAngleList[bIdx];
			const x = p * Math.cos(b);
			const y = p * Math.sin(b);
			tempCircle[bIdx] = vec3(x, y, z);
		};
		tempCircle[lSize] = tempCircle[0];

		for (let bIdx = longitudeAngleList.length - 1; bIdx >= 0; bIdx --) {
			const aPos = tempCircle[bIdx];
			const bPos = tempCircle[bIdx + 1];
			const cPos = prevCircle[bIdx + 1];
			const dPos = prevCircle[bIdx];

			positionSphere.push(
				aPos, bPos, cPos,
				cPos, dPos, aPos
				);
		};
		prevCircle = tempCircle;
		tempCircle = new Array(lSize + 1);
	};

	tempCircle.fill(vec3(0, 0, -r));
	for (let bIdx = longitudeAngleList.length - 1; bIdx >= 0; bIdx --) {
		const aPos = tempCircle[bIdx];
		const bPos = tempCircle[bIdx + 1];
		const cPos = prevCircle[bIdx + 1];
		const dPos = prevCircle[bIdx];

		positionSphere.push(
			aPos, bPos, cPos,
			cPos, dPos, aPos
			);
	};
	return positionSphere;
};


//
// modeling functions
//

// construct firefly model // TODO: modeling
// float(0, 0.5] => void
function getFireflyModel(sizeFirefly) {
	positionsFirefly.length = 0;
	colorsFirefly.length = 0;

	// body //heading to x+
	const bodyPosition = [[
			vec3(0, 0, 0),
			vec3(-sizeFirefly * Math.sqrt(3), -sizeFirefly * Math.sqrt(3) / 3, -sizeFirefly),
			vec3(-sizeFirefly * Math.sqrt(3), -sizeFirefly * Math.sqrt(3) / 3, sizeFirefly),
			vec3(-sizeFirefly * Math.sqrt(3), sizeFirefly * 2 * Math.sqrt(3) / 3, 0)
			],[
			vec3(0, 0, 0),
			vec3(sizeFirefly * Math.sqrt(3), sizeFirefly * Math.sqrt(3) / 3, sizeFirefly),
			vec3(sizeFirefly * Math.sqrt(3), sizeFirefly * Math.sqrt(3) / 3, -sizeFirefly),
			vec3(sizeFirefly * Math.sqrt(3), -sizeFirefly * 2 * Math.sqrt(3) / 3, 0)
			]
		];

	const bodyColor = [vec3(0.2, 0.2, 0.2), vec3(0.8, 0.8, 0.8)];


	positionsFirefly.push(
		bodyPosition[0][0], bodyPosition[0][1], bodyPosition[0][2],
		bodyPosition[0][0], bodyPosition[0][2], bodyPosition[0][3],
		bodyPosition[0][0], bodyPosition[0][3], bodyPosition[0][1],
		bodyPosition[0][3], bodyPosition[0][2], bodyPosition[0][1],

		bodyPosition[1][0], bodyPosition[1][1], bodyPosition[1][2],
		bodyPosition[1][0], bodyPosition[1][2], bodyPosition[1][3],
		bodyPosition[1][0], bodyPosition[1][3], bodyPosition[1][1],
		bodyPosition[1][3], bodyPosition[1][2], bodyPosition[1][1]
		);

	colorsFirefly.push(
		bodyColor[0], bodyColor[0], bodyColor[0],
		bodyColor[0], bodyColor[0], bodyColor[0],
		bodyColor[0], bodyColor[0], bodyColor[0],
		bodyColor[0], bodyColor[0], bodyColor[0],

		bodyColor[1], bodyColor[1], bodyColor[1],
		bodyColor[1], bodyColor[1], bodyColor[1],
		bodyColor[1], bodyColor[1], bodyColor[1],
		bodyColor[1], bodyColor[1], bodyColor[1]
		);

	return;
};

// construct glow model
// float(0, 0.5] => void
function getGlowModel(sizeGlow) {
	const lSizeGlow = 16;
	const bSizeGlow = 14;
	const glowColor = vec3(0.9, 0.9, 0);

	positionsGlow = getSphere(sizeGlow, lSizeGlow, bSizeGlow);
	// colorsGlow = Array(positionsGlow.length).fill(glowColor);
	return;
}


//
// moving functions
//

// check if tempTranslation is out of boundary
// (vec3(x, y, z), float[0, 0.3)) => Boolean{true: out, false: in}
function checkBoundary(tempTranslation, margin) {
	for (let idx = tempTranslation.length - 1; idx >= 0; idx --) {
		if (tempTranslation[idx] > 1 - margin) {
			return true;
		} else if (tempTranslation[idx] < -1 + margin) {
			return true;
		};
	};
	return false;
};

// check if tempTranslation is inside [+- margin, +- margin, +- margin]
// (vec3(x, y, z), float[0, 0.3)) => Boolean{true: in, false: out}
function checkInnerBoundary(tempTranslation, margin) {
	for (let idx = tempTranslation.length - 1; idx >= 0; idx --) {
		if (tempTranslation[idx] > margin || tempTranslation[idx] < -margin) {
			return false;
		};
	};
	return true;
};

// check if tempTranslation collides with others in translationList, where index(tempTranslation) is tempIdx
// (vec3(x, y, z), Array[vec3], int[0, length - 1), float[0, 0.3)) => Boolean{true: collision, false: safe}
function checkCollision(tempTranslation, translationList, tempIdx, margin) {
	for (let idx = translationFirefly.length - 1; idx >= 0; idx --) {
		if (idx === tempIdx) {
			continue;
		};
		if (getDistance(tempTranslation, translationFirefly[idx]) < margin) {
			return true;
		};
	};
	return false;
};

//check if tempGLow is glowing
// Boolean => Boolean{true: dark, false: glowing}
function checkNotGlow(tempGLow) {
	return !tempGLow
}

//check translationList neighbors in margin distance satisfy conditionFunction, given condistionList
// (vec3(x, y, z), Array[vec3], int[0, length - 1), float[0, 0.3), Array(object), function(object)) => Array[idx]
function checkConditioningNeighbor(tempTranslation, translationList, tempIdx, margin, conditionList, conditionFunction) {
	let idxList = [];
	for (let idx = translationFirefly.length - 1; idx >= 0; idx --) {
		if (idx === tempIdx) {
			continue;
		};
		if (conditionFunction(conditionList[idx])) {
			if (getDistance(tempTranslation, translationFirefly[idx]) < margin) {
				idxList.push(idx)
			};
		};
	};
	return idxList
};

// update rotationFirefly
// void => void
function updateFireflyRotation() {
	const rotationSpeed = 0.5;
	rotationFirefly.forEach((tempRotation, idx) => rotationFirefly[idx] = randomRotate(tempRotation, rotationSpeed));
	return;
};

// update translationFirefly
// void => void
function updateFireflyTranslation() {
	const translationSpeed = 0.001;
	const boundaryMargin = sizeFirefly * 8;
	const collisionMargin = sizeFirefly * 4;
	const turningRotationSpeed = 20;
	translationFirefly.forEach((tempTranslation, idx) => {
		const nextTranslation = randomTranslate(tempTranslation, rotationFirefly[idx], translationSpeed);
		if (checkBoundary(nextTranslation, boundaryMargin)) {
			// out of boundary, turn back
			rotationFirefly[idx] = vec3(rotationFirefly[idx][0], rotationFirefly[idx][1], 180 + rotationFirefly[idx][2]);
		} else if (checkInnerBoundary(nextTranslation, 0.1 + boundaryMargin)) {
			// out of boundary, turn back
			rotationFirefly[idx] = vec3(rotationFirefly[idx][0], rotationFirefly[idx][1], 180 + rotationFirefly[idx][2]);
		} else if (checkCollision(nextTranslation, translationFirefly, idx, collisionMargin)) {
			// collision, turn aside
			rotationFirefly[idx] = vec3(rotationFirefly[idx][0], 5 + rotationFirefly[idx][1], 30 + rotationFirefly[idx][2]);
		} else {
			// safe, go
			translationFirefly[idx] = nextTranslation;
		};
		return;
	});
	return;
};

// update transpose iteratively, count is used for slowing down rotation
// int[0, inf) => void
function updateFireflyTranspose(count) {
	if (count === 0) {
		updateFireflyRotation();
	};
	updateFireflyTranslation();
	return;
};

// update glow clock
// void => void
function updateGlowClock() {
	const clockGlowSpeed = 0.05;
	const nudgeRange = sizeFirefly * nudgeRangeFactor;
	const nudgeSpeed = 0.001 * nudgeSpeedFactor;

	clockFirefly.forEach((clock, idx) => {
		if (flagGlow[idx]) {
			//glowing, increase glow clock
			clockGlow[idx] += clockGlowSpeed;
			if (clockGlow[idx] >= 1) {
				//ending of glow
				clockGlow[idx] = 1;
				clockFirefly[idx] = 0;
				flagGlow[idx] = false;
			};
		} else {
			//not glowing, increase firefly clock
			clockFirefly[idx] += clockFireflySpeed;
			if (clockFirefly[idx] >= 1) {
				//starting of glow
				clockGlow[idx] = 0;
				clockFirefly[idx] = 1;
				flagGlow[idx] = true;

				//nudge neighbors
				let idxList = checkConditioningNeighbor(translationGlow[idx], translationGlow, idx, nudgeRange, flagGlow, checkNotGlow);
				idxList.forEach((index, indexIdx) => {
					clockFirefly[index] += nudgeSpeed;
				});
			};
		};
	});
	return;
};

// update all things, count is used for slowing down rotation
// int[0, inf) => void
function updateAll(count) {
	if (resetFlag) {
		return;
	}
	const fireflyRotationSlowDownRatio = 2;
	updateFireflyTranspose(count);
	updateGlowClock();
	setTimeout(() => updateAll((count + 1) % fireflyRotationSlowDownRatio), frameSpeedMS); //update here to avoid frame rate influence
	return;
};


//
// init functions
//

// fill fireflies from tempNumFirefly to numFirefly
// int [0, numFirefly) => void
function appendFirefly(tempNumFirefly) {
	const fireflyTranslationHalfRange = 1 - 10 * sizeFirefly;
	const fireflyTranslationRange = 2 * fireflyTranslationHalfRange;
	const collisionMargin = sizeFirefly * 6;
	const innerBoundaryMargin = sizeFirefly * 8;
	while (tempNumFirefly < numFirefly) {
		//translation
		let tempTranslationFirefly;
		do {
			do {
				tempTranslationFirefly = vec3(
					Math.random() * fireflyTranslationRange - fireflyTranslationHalfRange,
					Math.random() * fireflyTranslationRange - fireflyTranslationHalfRange,
					Math.random() * fireflyTranslationRange - fireflyTranslationHalfRange
					);
			} while (checkInnerBoundary(tempTranslationFirefly, 0.15 + innerBoundaryMargin));
		} while (checkCollision(tempTranslationFirefly, translationFirefly, tempNumFirefly, collisionMargin));
		translationFirefly.push(tempTranslationFirefly);

		//rotation
		const tempYaw = Math.random() * 360;
		const tempPitch = Math.random() * 180 - 90;
		const tempRow = Math.random() * 180 - 90;
		rotationFirefly.push(vec3(tempRow, tempPitch, tempYaw));

		tempNumFirefly ++;
	};
	return;
};

// construct fireflies
// void => void
function buildFirefly() {
	// firefly model
	getFireflyModel(sizeFirefly);

	// firefly transpose
	translationFirefly.length = 0;
	rotationFirefly.length = 0;
	
	appendFirefly(0);
	return;
};

// fill glows from tempNumFirefly to numFirefly
// int [0, numFirefly) => void
function appendGlow(tempNumFirefly) {
	while (tempNumFirefly < numFirefly) {
		clockFirefly.push(Math.random());
		clockGlow.push(1);
		tempNumFirefly ++;
	}
};

// construct glows
// void => void
function buildGlow() {
	getGlowModel(4 * sizeFirefly);

	clockGlow.length = 0;
	clockFirefly.length = 0;
	translationGlow = translationFirefly;
	rotationGlow = rotationFirefly;

	appendGlow(0);
	return;
};

// update fireflies (and glows) to the numFirefly
// void => void
function updateNumFirefly() {
	if (!resetFlag) {
		if (numFirefly < translationFirefly.length) {
			translationFirefly.length = numFirefly;
			rotationFirefly.length = numFirefly;
			clockFirefly.length = numFirefly;
			translationGlow.length = numFirefly;
			rotationGlow.length = numFirefly;
			clockGlow.length = numFirefly;
			flagGlow.length = numFirefly;
		} else if (numFirefly > positionsFirefly.length) {
			const tempNumFirefly = translationFirefly.length;
			appendFirefly(tempNumFirefly);
			appendGlow(tempNumFirefly);
		}
	}
	return;
};

// construct perspective projection with given fov
// int[30, 150] => void
function buildCamera(fov) {
	const [aspect, near, far] = [1, 0.1, 1];
	projectionMat = perspective(fov, aspect, near, far);
	return;
};


// init shaders, bind buffers and send models
// void => void
function initDrawing() {
	//  Load shaders and initialize attribute buffers

	programFirefly = initShaders(gl, "firefly-vertex-shader", "firefly-fragment-shader");
	programGlow = initShaders(gl, "glow-vertex-shader", "glow-fragment-shader");

	// Load the data into the GPU

	// firefly
	gl.useProgram(programFirefly);

	cBufferFirefly = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, cBufferFirefly);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(colorsFirefly), gl.STATIC_DRAW);

	colorLocFirefly = gl.getAttribLocation(programFirefly, "aColorFirefly");
	gl.enableVertexAttribArray(colorLocFirefly);

	vBufferFirefly = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vBufferFirefly);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(positionsFirefly), gl.STATIC_DRAW);

	positionLocFirefly = gl.getAttribLocation(programFirefly, "aPositionFirefly");
	gl.enableVertexAttribArray(positionLocFirefly);

	transposeFireflyLoc = gl.getUniformLocation(programFirefly, "transposeFirefly");
	projectionFireflyLoc = gl.getUniformLocation(programFirefly, "projectionFirefly");


	// glow
	gl.useProgram(programGlow);

	vBufferGlow = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vBufferGlow);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(positionsGlow), gl.STATIC_DRAW);

	positionLocGlow = gl.getAttribLocation(programGlow, "aPositionGlow");
	gl.enableVertexAttribArray(positionLocGlow);

	transposeGlowLoc = gl.getUniformLocation(programGlow, "transposeGlow");
	colorGlowLoc = gl.getUniformLocation(programGlow, "colorGlow");
	alphaGlowLoc = gl.getUniformLocation(programGlow, "alphaGlow");
	scaleGlowLoc = gl.getUniformLocation(programGlow, "scaleGlow");
	projectionGlowLoc = gl.getUniformLocation(programGlow, "projectionGlow");

	render();
	return;
};

// reset drawing. response to button "Refresh!"
// void => void
function buildAllDrawAll() {
	resetFlag = true;
	buildFirefly();
	buildGlow();
	buildCamera(fov);

	setTimeout(() => {
		resetFlag = false;
		initDrawing();
		updateAll(0);
		return;
	}, 5 * frameSpeedMS);

	return;
};

// reset to defualt config, response to button "Default Config."
// void => void
function useDefaultConfig() {
	perspectiveFlag = false;
	cameraMat = mat4();
	cameraRotation = vec3(0, 0, 0);

	numFirefly = 256;
	document.getElementById("numFirefly").value = numFirefly;
	document.getElementById("numFireflyValue").textContent = `#firefly: ${numFirefly}`;
	updateNumFirefly();

	colorGlowHue = 60;
	document.getElementById("colorGlowHue").value = colorGlowHue;
	document.getElementById("colorGlowHueValue").textContent = `glowing hue: ${colorGlowHue}`;
	colorGlow = hslToRgb(colorGlowHue / 360, colorGlowSaturation, colorGlowLightness);

	glowSizeFactor = 100;
	document.getElementById("glowSize").value = glowSizeFactor;
	document.getElementById("glowSizeValue").textContent = `glowing size: ${glowSizeFactor}`;
	glowSize = glowSizeFactor / 100;

	glowFrequencyFactor = 8;
	document.getElementById("glowFrequency").value = glowFrequencyFactor;
	document.getElementById("glowFrequencyValue").textContent = `glowing frequency: ${glowFrequencyFactor}`;
	clockFireflySpeed = glowFrequencyFactor / 1000;

	nudgeRangeFactor = 32;
	document.getElementById("nudgeRangeFactor").value = nudgeRangeFactor;
	document.getElementById("nudgeRangeFactorValue").textContent = `nudge range: ${nudgeRangeFactor}`;

	nudgeSpeedFactor = 8;
	document.getElementById("nudgeSpeedFactor").value = nudgeSpeedFactor;
	document.getElementById("nudgeSpeedFactorValue").textContent = `nudge amount: ${nudgeSpeedFactor}`;

	fov = 90;
	document.getElementById("fov").value = fov;
	document.getElementById("fovValue").textContent = `first person FOV: ${fov}`;
	buildCamera(fov);

	document.getElementById("cameraYaw").value = cameraRotation[1];
	document.getElementById("cameraYawValue").textContent = `first person camera yaw: ${cameraRotation[1]}`;

	document.getElementById("cameraPitch").value = -cameraRotation[0];
	document.getElementById("cameraPitchValue").textContent = `first person camera pitch: ${-cameraRotation[0]}`;

	return;
};

// switch between first person / third person view, response to button "switch view"
// void => void
function switchView() {
	perspectiveFlag = !perspectiveFlag;
	if (perspectiveFlag) {
		cameraMat = mult(projectionMat, getRotationMat(cameraRotation));
	} else {
		cameraMat = mat4();
	};
	return;
};


// init the whole program
// void => void
window.onload = function init() {
	const canvas = document.getElementById("gl-canvas");
	canvas.width = 800;
	canvas.height = 800;
	const viewSize = Math.min(canvas.width, canvas.height);
	// const viewXPos = canvas.width - viewSize; // no need, because it should be left-aligned
	const viewYPos = canvas.height - viewSize;

	//menu
	document.getElementById("numFirefly").value = numFirefly;
	document.getElementById("numFireflyValue").textContent = `#firefly: ${numFirefly}`;
	document.getElementById("numFirefly").oninput = function() {
		numFirefly = parseInt(this.value);
		document.getElementById("numFireflyValue").textContent = `#firefly: ${numFirefly}`;
		updateNumFirefly();
		return;
	};

	document.getElementById("colorGlowHue").value = colorGlowHue;
	document.getElementById("colorGlowHueValue").textContent = `glowing hue: ${colorGlowHue}`;
	document.getElementById("colorGlowHue").oninput = function() {
		colorGlowHue = parseInt(this.value);
		document.getElementById("colorGlowHueValue").textContent = `glowing hue: ${colorGlowHue}`;
		colorGlow = hslToRgb(colorGlowHue / 360, colorGlowSaturation, colorGlowLightness);
		return;
	};

	document.getElementById("glowSize").value = glowSizeFactor;
	document.getElementById("glowSizeValue").textContent = `glowing size: ${glowSizeFactor}`;
	document.getElementById("glowSize").oninput = function() {
		glowSizeFactor = parseInt(this.value);
		document.getElementById("glowSizeValue").textContent = `glowing size: ${glowSizeFactor}`;
		glowSize = glowSizeFactor / 100;
		return;
	};

	document.getElementById("glowFrequency").value = glowFrequencyFactor;
	document.getElementById("glowFrequencyValue").textContent = `glowing frequency: ${glowFrequencyFactor}`;
	document.getElementById("glowFrequency").oninput = function() {
		glowFrequencyFactor = parseInt(this.value);
		document.getElementById("glowFrequencyValue").textContent = `glowing frequency: ${glowFrequencyFactor}`;
		clockFireflySpeed = glowFrequencyFactor / 1000;
		return;
	};

	document.getElementById("nudgeRangeFactor").value = nudgeRangeFactor;
	document.getElementById("nudgeRangeFactorValue").textContent = `nudge range: ${nudgeRangeFactor}`;
	document.getElementById("nudgeRangeFactor").oninput = function() {
		nudgeRangeFactor = parseInt(this.value);
		document.getElementById("nudgeRangeFactorValue").textContent = `nudge range: ${nudgeRangeFactor}`;
		return;
	};

	document.getElementById("nudgeSpeedFactor").value = nudgeSpeedFactor;
	document.getElementById("nudgeSpeedFactorValue").textContent = `nudge amount: ${nudgeSpeedFactor}`;
	document.getElementById("nudgeSpeedFactor").oninput = function() {
		nudgeSpeedFactor = parseInt(this.value);
		document.getElementById("nudgeSpeedFactorValue").textContent = `nudge amount: ${nudgeSpeedFactor}`;
		return;
	};

	document.getElementById("fov").value = fov;
	document.getElementById("fovValue").textContent = `first person FOV: ${fov}`;
	document.getElementById("fov").oninput = function() {
		fov = parseInt(this.value);
		document.getElementById("fovValue").textContent = `first person FOV: ${fov}`;
		buildCamera(fov);
		if (perspectiveFlag) {
			cameraMat = mult(projectionMat, getRotationMat(cameraRotation));
		};
		return;
	};

	document.getElementById("cameraYaw").value = cameraRotation[1];
	document.getElementById("cameraYawValue").textContent = `first person camera yaw: ${cameraRotation[1]}`;
	document.getElementById("cameraYaw").oninput = function() {
		cameraRotation[1] = parseInt(this.value);
		document.getElementById("cameraYawValue").textContent = `first person camera yaw: ${cameraRotation[1]}`;
		if (perspectiveFlag) {
			cameraMat = mult(projectionMat, getRotationMat(cameraRotation));
		};
		return;
	};

	document.getElementById("cameraPitch").value = -cameraRotation[0];
	document.getElementById("cameraPitchValue").textContent = `first person camera pitch: ${-cameraRotation[0]}`;
	document.getElementById("cameraPitch").oninput = function() {
		cameraRotation[0] = -parseInt(this.value);
		document.getElementById("cameraPitchValue").textContent = `first person camera pitch: ${-cameraRotation[0]}`;
		if (perspectiveFlag) {
			cameraMat = mult(projectionMat, getRotationMat(cameraRotation));
		};
		return;
	};

	//keyboard interaction
	window.onkeydown = function(event) {
		const key = event.keyCode;
		const cameraSpeed = 1
		switch(key) {
			case 87: // w
				if (perspectiveFlag) {
					if (cameraRotation[0] <= -90){
						cameraRotation[0] = -90;
					} else {
						cameraRotation[0] -= cameraSpeed; //reverse for inverse
						cameraRotation[0] %= 360;
					};
					cameraMat = mult(projectionMat, getRotationMat(cameraRotation));
					document.getElementById("cameraPitch").value = -cameraRotation[0];
					document.getElementById("cameraPitchValue").textContent = `first person camera pitch: ${-cameraRotation[0]}`;
				};
				break;
			case 83: // s
				if (perspectiveFlag) {
					if (cameraRotation[0] > 90) {
						cameraRotation[0] = 90;
					} else {
						cameraRotation[0] += cameraSpeed; //reverse for inverse
						cameraRotation[0] %= 360;
					};
					cameraMat = mult(projectionMat, getRotationMat(cameraRotation));
					document.getElementById("cameraPitch").value = -cameraRotation[0];
					document.getElementById("cameraPitchValue").textContent = `first person camera pitch: ${-cameraRotation[0]}`;
				};
				break;
			case 65: // a
				if (perspectiveFlag) {
					cameraRotation[1] -= cameraSpeed; //reverse for inverse
					cameraRotation[1] %= 360;
					if (cameraRotation[1] < -180) {
						cameraRotation[1] += 360;
					};
					cameraMat = mult(projectionMat, getRotationMat(cameraRotation));
					document.getElementById("cameraYaw").value = cameraRotation[1];
					document.getElementById("cameraYawValue").textContent = `first person camera yaw: ${cameraRotation[1]}`;
				};
				break;
			case 68: // d
				if (perspectiveFlag) {
					cameraRotation[1] += cameraSpeed; //reverse for inverse
					cameraRotation[1] %= 360;
					if (cameraRotation[1] > 180) {
						cameraRotation[1] -= 360;
					};
					cameraMat = mult(projectionMat, getRotationMat(cameraRotation));
					document.getElementById("cameraYaw").value = cameraRotation[1];
					document.getElementById("cameraYawValue").textContent = `first person camera yaw: ${cameraRotation[1]}`;
				};
				break;
		};
		return;
	};


	gl = canvas.getContext('webgl2');
	if (!gl) alert( "WebGL 2.0 isn't available" );

	//
	//  Configure WebGL
	//
	gl.viewport(0, viewYPos, viewSize, viewSize);
	gl.clearColor(0.0, 0.0, 0.0, 1.0);

	gl.enable(gl.DEPTH_TEST);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	buildAllDrawAll();
	return;
};


//
// rendering function
//

// call webgl to draw a new frame
// void => void
function render() {
	if (resetFlag) {
		return;
	};

	setTimeout(() => {
		requestAnimationFrame(render);

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		// draw fireflies
		for (let i = clockFirefly.length - 1; i >= 0; i --) {
			//
			// non-transparent part
			//

			// for each firefly, use firefly model
			gl.depthMask(true);
			gl.useProgram(programFirefly);
			gl.bindBuffer(gl.ARRAY_BUFFER, cBufferFirefly);
			gl.vertexAttribPointer(colorLocFirefly, 3, gl.FLOAT, false, 0, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, vBufferFirefly);
			gl.vertexAttribPointer(positionLocFirefly, 3, gl.FLOAT, false, 0, 0);

			// compute transpose matrix as uniform variable
			const transposeMat = getTransposeMat(rotationFirefly[i], translationFirefly[i])
			gl.uniformMatrix4fv(transposeFireflyLoc, false, flatten(transposeMat));
			gl.uniformMatrix4fv(projectionFireflyLoc, false, flatten(cameraMat));

			gl.drawArrays(gl.TRIANGLES, 0, positionsFirefly.length);

			//
			//transparent part
			//

			// for each glow, use glow model
			gl.depthMask(false);
			gl.useProgram(programGlow);
			// gl.bindBuffer(gl.ARRAY_BUFFER, cBufferGlow);
			// gl.vertexAttribPointer(colorLocGlow, 3, gl.FLOAT, false, 0, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, vBufferGlow);
			gl.vertexAttribPointer(positionLocGlow, 3, gl.FLOAT, false, 0, 0);

			// compute transpose matrix as uniform variable
			// // const transposeMat = getTransposeMat(rotationGlow[i], translationGlow[i]) // same transportation
			gl.uniformMatrix4fv(transposeGlowLoc, false, flatten(transposeMat));
			gl.uniformMatrix4fv(projectionGlowLoc, false, flatten(cameraMat));
			// compute glow factor using (1 - x) ^ 2
			const glowFactor = Math.pow(( 1 - clockGlow[i]), 2);
			gl.uniform1f(alphaGlowLoc, glowFactor / 4);
			const scaleGlowMat = scale(glowFactor * glowSize, glowFactor * glowSize, glowFactor * glowSize);
			gl.uniformMatrix4fv(scaleGlowLoc, false, flatten(scaleGlowMat));
			gl.uniform3fv(colorGlowLoc, colorGlow);

			gl.drawArrays(gl.TRIANGLES, 0, positionsGlow.length);

			gl.depthMask(true);
		};
	}, frameSpeedMS);
	return;
};

