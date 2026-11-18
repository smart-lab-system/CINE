
class Node{
    int r;
    int c;
    
    Node(int row, int col){
        r=row;
        c=col;
    }
}
class Solution
{
    //Function to return the minimum cost to react at bottom
	//right cell from top left cell.
    public int minimumCostPath(int[][] grid)
    {
        // Code here
        int n=grid.length, i, j, r1, c1;
        
        int dis[][] = new int[n][n];
        
        for(i=0; i<n; i++)
        {
            for(j=0; j<n; j++){
                dis[i][j]=100000000;
            }
        }
        
        boolean vis[][] = new boolean[n][n];
        
        PriorityQueue<Node> q = new PriorityQueue<>(new Comparator<Node>(){
            public int compare(Node a, Node b){
                return dis[a.r][a.c]-dis[b.r][b.c];
            }
        });
        
        q.add(new Node(0, 0));
        dis[0][0]=grid[0][0];
        
        while(q.isEmpty()==false){
            Node x = q.poll();
            
            r1=x.r; c1=x.c;
            
            if(vis[r1][c1]==true){
                continue;
            }
            
            vis[r1][c1]=true;
            
            if(r1-1>=0 && dis[r1-1][c1]>dis[r1][c1]+grid[r1-1][c1]){
                dis[r1-1][c1]=dis[r1][c1]+grid[r1-1][c1];
                q.add(new Node(r1-1, c1));
            }
            
            if(c1-1>=0 && dis[r1][c1-1]>dis[r1][c1]+grid[r1][c1-1]){
                dis[r1][c1-1]=dis[r1][c1]+grid[r1][c1-1];
                q.add(new Node(r1, c1-1));
            }
            
            if(r1+1<n && dis[r1+1][c1]>dis[r1][c1]+grid[r1+1][c1]){
                dis[r1+1][c1]=dis[r1][c1]+grid[r1+1][c1];
                q.add(new Node(r1+1, c1));
            }
            
            if(c1+1<n && dis[r1][c1+1]>dis[r1][c1]+grid[r1][c1+1]){
                dis[r1][c1+1]=dis[r1][c1]+grid[r1][c1+1];
                q.add(new Node(r1, c1+1));
            }
        }
        
        return dis[n-1][n-1];
        
    }
}