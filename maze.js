var oC2 = document.getElementById('c2d');
        var ctx = oC2.getContext('2d');

        var width = oC2.width;
        var height = oC2.height;
        var maxX = 18;
        var maxY = 13;

        var firstGrid;
        var endGrid;

        function Grid(x, y) {
            this.x = x;
            this.y = y;
            this.choosed = false;
            this.children = [];
            this.initNeighbor();
        }

        Grid.prototype.initNeighbor = function() {
            var x = this.x;
            var y = this.y;

            this.neighbor = [];

            if(y > 0) {
                this.neighbor.push({
                   x: x,
                   y: y - 1 
                });
            }

            if(y < maxY) {
                this.neighbor.push({
                    x: x,
                    y: y + 1
                });
            }

            if(x > 0) {
                this.neighbor.push({
                   x: x - 1,
                   y: y 
                });
            }

            if(x < maxX) {
                this.neighbor.push({
                   x: x + 1,
                   y: y
                });
            }

            this.neighbor.sort(function() {
                return 0.5 - Math.random();
            });
        };

        Grid.prototype.getNeighbor = function() {
            var x, y, neighbor;

            this.choosed = true;

            for(var i = 0; i < this.neighbor.length; i++) {
                x = this.neighbor[i].x;
                y = this.neighbor[i].y;

                neighbor = maze.grids[y][x];

                if(!neighbor.choosed) {

                    neighbor.parent = this;

                    return neighbor;
                }
            }

            if(this.parent === firstGrid) {
                return 0;
            } else {
                return 1;
            }
        };

        function Maze() {
            this.path = [];
            this.grids = [];
            this.stack = [];
            this.init();
        }

        Maze.prototype.init = function() {
            for(var i = 0; i <= maxY; i++) {
                this.grids[i] = [];
                for(var j = 0; j <= maxX; j++) {
                    this.grids[i][j] = new Grid(j, i);
                }
            }

            firstGrid = this.grids[0][0];
            endGrid = this.grids[13][18];
        };

        Maze.prototype.findPath = function() {
            var tmp;
            var curr = firstGrid;
            while(1) {
                tmp = curr.getNeighbor();

                if(tmp === 0) {
                    console.log('loop ends');
                    break;
                } else if(tmp === 1) {
                    curr = curr.parent;
                } else {

                    curr.children[curr.children.length] = tmp;

                    curr = tmp;
                }
            }
        };


        function drawPath(node) {;
            var i = 0;

            drawRect(node.x * 20, node.y * 20);

            for(; i < node.children.length; i++) {
                if(node.children[i]) {
                    drawRect(node.x * 20 + (node.children[i].x - node.x) * 10, node.y * 20 + (node.children[i].y - node.y) * 10); // 画路
                    drawPath(node.children[i]);
                }
            }

        }

        function drawRect(x, y) {
            ctx.fillRect(x + 10, y + 10, 10, 10);
        }

        function drawDebug(x, y, color) {
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.arc(x, y, 1, 0, Math.PI * 2, false);
            ctx.fill();
            ctx.closePath();
        }

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'white';

        var maze = new Maze();

        maze.findPath();

        drawPath(firstGrid);

        drawStartEnd();

        function drawStartEnd() {
            ctx.fillRect(0, 10, 10, 10);
            ctx.fillRect(19 * 20, 13 * 20 + 10, 10, 10);
    }