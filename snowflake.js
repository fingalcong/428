var canvas;
var gl;
var positions = [];
var iteration = 7; 

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext('webgl2');
    if (!gl) { alert("WebGL isn't available"); }

    var vertices = [
         vec2(-0.5, -0.5),
         vec2(0, Math.sqrt(3)*0.5-0.5),
         vec2(0.5, -0.5)
    ];

    koch(vertices[0],vertices[1],vertices[2],iteration);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);


    var program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    var bufferId = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(positions), gl.STATIC_DRAW);


    var positionLoc = gl.getAttribLocation(program, "aPosition");
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionLoc);    

    render();
};
function PositionofLines(point, p){
  var sin = Math.sin( 60 * Math.PI / 180);
  var cos = Math.cos( 60 * Math.PI / 180);
  var m = (p[0] - point[0])*cos - (p[1] - point[1])*sin + point[0];
  var n = (p[0] - point[0])*sin + (p[1] - point[1])*cos + point[1];
  var f = vec2(m,n);
  return f;
}

function divide(m, n,count)
{
  if(count === 0){
    var l;
    var r;
    l = mix(m,n,1/3);
    r = mix(m,n,2/3);
    var f = PositionofLines(l, r);
    positions.push(m,l);
    positions.push(l,f);
    positions.push(f,r);
    positions.push(r,n);
  }else {
    var mn = mix (m,n,1/3);
    var nm = mix (n,m,1/3);
    var v = PositionofLines(mn, nm);
    count --;
    divide(m,mn,count);
    divide(nm,n,count);
    divide(mn,v,count);
    divide(v,nm,count);
  }
    return f;
}

function koch(m,n,l,count){
    divide(m,n,count);
    divide(n,l,count);
    divide(l,m,count);
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.LINES, 0, positions.length);

}
