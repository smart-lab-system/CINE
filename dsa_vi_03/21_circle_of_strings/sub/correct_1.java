

// User function Template for Java

class Solution {
    public int isCircle(String arr[]) {
        List<List<Integer>> list = new ArrayList<>();
        for(int i=0;i<26;i++)   list.add(new ArrayList<>());
        
        //count connected edges to every vertex
        int dp[] = new int[26];
        for(String s:arr){
            int a = s.charAt(0)-'a', b = s.charAt(s.length()-1)-'a';
            dp[a]++;
            dp[b]++;
            list.get(a).add(b);
        }
        
        for(int i:dp){
            //eulerian cycle
            if(i%2==1)  return 0;
        }
        
        boolean vis[] = new boolean[26];
        solve(arr[0].charAt(0)-'a',list,vis);
        
        for(int i=0;i<26;i++){
            //means more than one component
            //that's why this component is not covered by cycle
            if(dp[i]>0 && !vis[i])  return 0;
        }
        
        return 1;
    }
    void solve(int i,List<List<Integer>> list,boolean vis[]){
        if(vis[i])  return;
        
        vis[i] = true;
        for(int nbr:list.get(i)){
            solve(nbr,list,vis);
        }
    }
}
        // Return 1 if strongly connected, otherwi