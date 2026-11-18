
class Node {
    int r, c, cost;
    
    public Node(int r, int c, int cost) {
        this.r = r;
        this.c = c;
        this.cost = cost;
    }
}

class Solution {
    //Function to return the minimum cost to react at bottom
	//right cell from top left cell.
    public int minimumCostPath(int[][] grid) {
        // Code here
        return dijkstra(grid);
    }
    
    static int dijkstra(int [][] grid) {
        int n = grid.length, m = grid.length;
        int dist[][] = new int[n][m];
        
        for (int [] d : dist)
            Arrays.fill(d, Integer.MAX_VALUE);
            
        dist[0][0] = grid[0][0];
        PriorityQueue<Node> pq = new PriorityQueue<>((n1, n2) -> n1.cost - n2.cost);
        pq.add(new Node(0, 0, grid[0][0]));    
        grid[0][0] = -1;
        int dirs[][] = {{0, -1}, {0, 1}, {-1, 0}, {1, 0}};
        
        while(!pq.isEmpty()) {
            Node node = pq.poll();
            int row = node.r, col = node.c, cost = node.cost;
            
            for (int d[]: dirs) {
                int nr = row + d[0], nc = col + d[1];
                
                if (nr < 0 || nr >= n || nc < 0 || nc >= m || grid[nr][nc] == -1)
                    continue;
                
                if (cost + grid[nr][nc] < dist[nr][nc]) {
                    dist[nr][nc] = cost + grid[nr][nc];
                    pq.add(new Node(nr, nc, dist[nr][nc]));
                }
                
                grid[nr][nc] = -1;
            }
        }
        
        return dist[n - 1][m - 1];
    }
}