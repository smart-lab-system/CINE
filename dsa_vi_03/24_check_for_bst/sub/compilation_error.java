

// User function Template for Java

class Solution {
    // Function to check whether a Binary Tree is BST or not.
    boolean isBST(Node root) {
        return helper(root, Integer.MIN_VALUE, Integer.MIN_VALUE);
    }

    boolean helper(Node root, int min, int max)
    {
        if(root==null)
        {
         return true;
        }
        int data = root.val;
        if(data <= min || data >= max){
            return false;
        }
        return helper(root.left, min, data) &&  helper(root.right, data, max);
    }
}